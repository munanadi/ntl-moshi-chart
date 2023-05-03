const createCanvas = require("canvas");
const ChartJSNodeCanvas = require("chartjs-node-canvas");
const axios = require("axios");
const s = require("@supabase/supabase-js");

const STORAGE_URL =
  "https://yprncwegyywwyzcnxoeu.supabase.co/storage/v1/object/public/moshi-charts/";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_KEY ?? "";
const supabase = s.createClient(supabaseUrl, supabaseKey);

exports.handler = async function (request, context) {
  try {
    const queryParams = request.queryStringParameters;

    // Check for necessary query params
    if (!queryParams?.base) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message:
            "Request was sent without base as query params",
        }),
      };
    }

    const { base } = queryParams;

    // Check if base-30 chart was created a day back, show return cached image.
    const today = new Date();
    const month = today.getUTCMonth() + 1;
    const date = today.getUTCDate();

    const fileName = `${base}-30-${date}-${month}-chart.png`;

    // check if  files exists
    const { data: fetchedFiles, error: fetchedError } =
      await supabase.storage
        .from("moshi-charts")
        .list(undefined, {
          limit: 100,
          search: `${base}-30-${date}`,
        });

    // console.log({ fetchedFile, fetchedError });

    const fetchedFile = fetchedFiles?.find(
      (file) => file.name === fileName
    );

    if (fetchedFile) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          file_found: true,
          file_created: false,
          file_url: `${STORAGE_URL}${fetchedFile.name}`,
        }),
      };
    }

    // File not found, create one
    const fetchUrl = `https://api.mochi.pod.town/api/v1/defi/market-chart?coin_id=${base}&currency=usd&days=30`;

    // Create chart data
    const res = await axios.get(fetchUrl);
    const compareData = await res.data;

    const { times, prices, from, to } = compareData.data;
    console.log(prices, times, from, to);

    const chart = await renderChartImage({
      chartLabel: `Price (USD) | ${from} - ${to}`,
      labels: times,
      data: prices,
    });

    const bufferData = Buffer.from(chart);

    const { data, error } = await supabase.storage
      .from("moshi-charts")
      .upload(fileName, bufferData, {
        cacheControl: "8760",
        contentType: "image/png",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const imageUrl = data.path;

    return {
      statusCode: 200,
      body: JSON.stringify({
        file_found: false,
        file_created: true,
        file_url: `${STORAGE_URL}${imageUrl}`,
      }),
    };
  } catch (e) {
    console.log(e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: e,
      }),
    };
  }
};

function renderChartImage({
  chartLabel,
  labels,
  data = [],
}) {
  const chartCanvas =
    new ChartJSNodeCanvas.ChartJSNodeCanvas({
      width: 700,
      height: 450,
    });

  const colorConfig = {
    borderColor: "#009cdb",
    backgroundColor: getGradientColor(
      "rgba(53,83,192,0.9)",
      "rgba(58,69,110,0.5)"
    ),
  };

  const xAxisConfig = {
    ticks: {
      font: {
        size: 16,
      },
      color: colorConfig.borderColor,
    },
    grid: {
      borderColor: colorConfig.borderColor,
    },
  };
  const yAxisConfig = {
    ticks: {
      font: {
        size: 16,
      },
      color: colorConfig.borderColor,
      callback: (value) => {
        const rounded = Number(value).toPrecision(2);
        return rounded.includes("e") && Number(value) < 1
          ? rounded
          : Number(rounded) < 0.01 ||
            Number(rounded) > 1000000
          ? Number(rounded).toExponential()
          : formatDigit(String(value));
      },
    },
    grid: {
      borderColor: colorConfig.borderColor,
    },
  };
  return chartCanvas.renderToBuffer({
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: chartLabel,
          data,
          borderWidth: 3,
          pointRadius: 0,
          fill: true,
          ...colorConfig,
          tension: 0.2,
        },
      ],
    },
    options: {
      scales: {
        y: yAxisConfig,
        x: xAxisConfig,
      },
      plugins: {
        legend: {
          labels: {
            // This more specific font property overrides the global property
            font: {
              size: 18,
            },
          },
        },
      },
    },
  });
}

function getGradientColor(fromColor, toColor) {
  const canvas = createCanvas.createCanvas(100, 100);
  const ctx = canvas.getContext("2d");
  const backgroundColor = ctx.createLinearGradient(
    0,
    0,
    0,
    400
  );
  backgroundColor.addColorStop(0, fromColor);
  backgroundColor.addColorStop(1, toColor);
  return backgroundColor;
}

function formatDigit(str, fractionDigits = 6) {
  const num = Number(str);
  const s = num.toLocaleString(undefined, {
    maximumFractionDigits: 18,
  });
  const [left, right = ""] = s.split(".");
  if (
    Number(right) === 0 ||
    right === "" ||
    left.length >= 4
  )
    return left;
  const numsArr = right.split("");
  let rightStr = numsArr.shift();
  while (
    Number(rightStr) === 0 ||
    rightStr.length < fractionDigits
  ) {
    const nextDigit = numsArr.shift();
    if (!nextDigit) break;
    rightStr += nextDigit;
  }
  while (rightStr.endsWith("0")) {
    rightStr = rightStr.slice(0, rightStr.length - 1);
  }
  return left + "." + rightStr;
}
