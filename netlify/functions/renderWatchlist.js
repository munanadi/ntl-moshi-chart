const { createCanvas, loadImage } = require("canvas");
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
    // Check if base, target and interval chart was created a day back, show return cached image.
    const today = new Date();
    const month = today.getUTCMonth() + 1;
    const date = today.getUTCDate();

    const fileName = `watchlist-${date}-${month}-chart.png`;

    // check if  files exists
    const { data: fetchedFiles, error: fetchedError } =
      await supabase.storage
        .from("moshi-charts")
        .list(undefined, {
          limit: 100,
          search: `watchlist-${date}-${month}`,
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
    const fetchUrl = `https://api.mochi.pod.town/api/v1/defi/market-data`;

    // Create chart data
    const res = await axios.get(fetchUrl);
    const watchlistData = await res.data;
    const filteredData = Object.values(
      watchlistData.data
    ).filter((i) =>
      [("usdc", "usdt", "eth", "sol")].includes(
        i.symbol.toLowerCase()
      )
    );

    const chart = await renderWatchlist(filteredData);

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

    console.log({ data, error });

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

async function renderWatchlist(data) {
  const container = {
    x: {
      from: 0,
      to: 900,
    },
    y: {
      from: 0,
      to: 780,
    },
    w: 0,
    h: 0,
    pt: 50,
    pl: 10,
    radius: 0,
    bgColor: "rgba(0, 0, 0, 0)",
  };
  container.w = container.x.to - container.x.from;
  container.h = container.y.to - container.y.from;
  const canvas = createCanvas(container.w, container.h);
  const ctx = canvas.getContext("2d");
  drawRectangle(ctx, container, container.bgColor);

  const ascColor = "#56c9ac";
  const descColor = "#ed5565";
  const itemContainer = {
    x: {
      from: 0,
      to: 0,
    },
    y: {
      from: 0,
      to: 120,
    },
    mt: 10,
    w: 0,
    h: 120,
    pt: 20,
    pl: 15,
    radius: 7,
    bgColor: "#202020",
  };
  for (const [idx, item] of Object.entries(data)) {
    const leftCol = +idx % 2 === 0;
    itemContainer.x = {
      from: leftCol ? 0 : 455,
      to: leftCol ? 445 : 900,
    };
    drawRectangle(
      ctx,
      itemContainer,
      itemContainer.bgColor
    );
    const {
      symbol,
      current_price,
      sparkline_in_7d,
      price_change_percentage_7d_in_currency,
      image,
      is_pair,
    } = item;
    let imageUrl = image;
    // image
    const radius = 20;
    const imageX =
      itemContainer.x.from + (itemContainer.pl ?? 0);
    const imageY =
      itemContainer.y.from + (itemContainer.pt ?? 0);
    // if no imageUrl then find and use discord emoji URL
    // if (!imageUrl && is_pair) {
    //   const [base, target] = symbol
    //     .split("/")
    //     .map((s) => emojis[s.toUpperCase()]);
    //   imageUrl =
    //     base && target
    //       ? [getEmojiURL(base), getEmojiURL(target)].join(
    //           "||"
    //         )
    //       : "";
    // }
    if (imageUrl) {
      const imageStats = {
        radius,
      };
      if (!is_pair) {
        const image = await loadAndCacheImage(
          imageUrl,
          radius * 2,
          radius * 2
        );
        drawCircleImage({
          ctx,
          image,
          stats: {
            x: imageX + radius,
            y: imageY + radius,
            ...imageStats,
          },
        });
      } else {
        const imageUrls = imageUrl.split("||");
        const baseImage = await loadAndCacheImage(
          imageUrls[0],
          radius * 2,
          radius * 2
        );
        drawCircleImage({
          ctx,
          stats: {
            x: imageX + radius,
            y: imageY + radius,
            ...imageStats,
          },
          image: baseImage,
        });
        const targetImage = await loadAndCacheImage(
          imageUrls[1],
          radius * 2,
          radius * 2
        );
        drawCircleImage({
          ctx,
          stats: {
            x: imageX + radius * 2.5,
            y: imageY + radius,
            ...imageStats,
          },
          image: targetImage,
        });
      }
    }

    // symbol
    ctx.font = "bold 29px Inter";
    ctx.fillStyle = "white";
    const symbolText = symbol.toUpperCase();
    const symbolH = heightOf(ctx, symbolText);
    const symbolX =
      imageX + radius * (is_pair ? 3.5 : 2) + 10;
    const symbolY = imageY + radius + symbolH / 2;
    ctx.fillText(symbolText, symbolX, symbolY);

    // price
    ctx.font = "bold 30px Inter";
    ctx.fillStyle = "white";
    const currentPrice = `${
      is_pair ? "" : "$"
    }${current_price.toLocaleString()}`;
    const priceW = widthOf(ctx, currentPrice);
    const priceH = heightOf(ctx, currentPrice);
    const priceX = imageX;
    const priceY = imageY + priceH + radius * 2 + 10;
    ctx.fillText(currentPrice, priceX, priceY);

    // 7d change percentage
    ctx.font = "25px Inter";
    ctx.fillStyle =
      price_change_percentage_7d_in_currency >= 0
        ? ascColor
        : descColor;
    const change = `${
      price_change_percentage_7d_in_currency >= 0 ? "+" : ""
    }${price_change_percentage_7d_in_currency.toFixed(2)}%`;
    const changeX = priceX + priceW + 10;
    const changeY = priceY;
    ctx.fillText(change, changeX, changeY);

    // 7d chart
    const { price } = sparkline_in_7d;
    const labels = price?.map((p) => `${p}`);
    const buffer = await renderChartImage({
      labels,
      data: price,
      lineOnly: true,
      colorConfig: {
        borderColor:
          price_change_percentage_7d_in_currency >= 0
            ? ascColor
            : descColor,
        backgroundColor: "#fff",
      },
    });
    const chart = await loadImage(buffer);
    const chartW = 150;
    const chartH = 50;
    const chartX = itemContainer.x.to - chartW - 15;
    const chartY =
      itemContainer.y.from +
      (itemContainer.pt ?? 0) +
      chartH / 2;
    ctx.drawImage(chart, chartX, chartY, chartW, chartH);

    // next row
    if (!leftCol) {
      itemContainer.y.from +=
        itemContainer.h + (itemContainer.mt ?? 0);
      itemContainer.y.to =
        itemContainer.y.from + itemContainer.h;
    }
  }

  return canvas.toBuffer();
}

function drawRectangle(ctx, stats, hexColor, borderColor) {
  const { radius, x, y } = stats;
  ctx.save();
  // --------------
  ctx.beginPath();
  ctx.lineWidth = 6;
  if (hexColor) {
    ctx.fillStyle = hexColor;
  }
  ctx.moveTo(x.from + radius, y.from);
  ctx.lineTo(x.to - radius, y.from); // top edge
  ctx.arc(
    x.to - radius,
    y.from + radius,
    radius,
    1.5 * Math.PI,
    0
  ); // top-right corner
  ctx.lineTo(x.to, y.to - radius); // right edge
  ctx.arc(
    x.to - radius,
    y.to - radius,
    radius,
    0,
    0.5 * Math.PI
  ); // bottom-right corner
  ctx.lineTo(x.from + radius, y.to); // bottom edge
  ctx.arc(
    x.from + radius,
    y.to - radius,
    radius,
    0.5 * Math.PI,
    Math.PI
  ); // bottom-left corner
  ctx.lineTo(x.from, y.from + radius); // left edge
  ctx.arc(
    x.from + radius,
    y.from + radius,
    radius,
    Math.PI,
    1.5 * Math.PI
  ); // top-left corner
  ctx.fill();
  if (borderColor) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
  }
  ctx.closePath();
  // --------------
  ctx.restore();
}

async function drawCircleImage({
  ctx,
  stats,
  imageURL,
  image,
}) {
  if (!image && !imageURL) return;
  ctx.save();
  // --------------
  ctx.beginPath();
  ctx.lineWidth = stats.outlineWidth ?? 10;
  ctx.arc(stats.x, stats.y, stats.radius, 0, Math.PI * 2);
  if (stats.outlineColor) {
    ctx.strokeStyle = stats.outlineColor;
    ctx.stroke();
  }
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(
    image,
    stats.x - stats.radius,
    stats.y - stats.radius,
    stats.radius * 2,
    stats.radius * 2
  );
  // --------------
  ctx.restore();
}

function widthOf(ctx, text) {
  return ctx.measureText(text).width;
}

function heightOf(ctx, text) {
  return (
    ctx.measureText(text).actualBoundingBoxAscent +
    ctx.measureText(text).actualBoundingBoxDescent
  );
}

async function loadAndCacheImage(imageUrl, w, h) {
  if (!imageUrl) return null;
  let base64Str;
  try {
    const img = await loadImage(imageUrl, {
      format: "webp",
    });
    const imgCanvas = createCanvas(w, h);
    const imgCtx = imgCanvas.getContext("2d");
    imgCtx.drawImage(img, 0, 0, w, h);
    base64Str = imgCanvas.toDataURL("image/png");
  } catch (e) {
    console.log(`[loadAndCacheImage] failed: ${e}`);
  }

  return base64Str ? await loadImage(base64Str) : null;
}

const chartCanvas = new ChartJSNodeCanvas.ChartJSNodeCanvas(
  {
    width: 700,
    height: 450,
  }
);

function getGradientColor(fromColor, toColor) {
  const canvas = createCanvas(100, 100);
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

function renderChartImage({
  chartLabel,
  labels,
  data = [],
  colorConfig,
  lineOnly,
}) {
  const chartCanvas =
    new ChartJSNodeCanvas.ChartJSNodeCanvas({
      width: 700,
      height: 450,
    });

  if (!colorConfig) {
    colorConfig = {
      borderColor: "#009cdb",
      backgroundColor: getGradientColor(
        "rgba(53,83,192,0.9)",
        "rgba(58,69,110,0.5)"
      ),
    };
  }
  if (lineOnly) {
    colorConfig.backgroundColor = "rgba(0, 0, 0, 0)";
  }
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
          borderWidth: lineOnly ? 10 : 3,
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
      ...(lineOnly && {
        scales: {
          x: {
            grid: {
              display: false,
            },
            display: false,
          },
          y: {
            grid: {
              display: false,
            },
            display: false,
          },
        },
        plugins: {
          legend: {
            display: false,
          },
        },
      }),
    },
  });
}
