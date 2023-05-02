const { createCanvas } = require("canvas");
const axios = require("axios");
const { squarify } = require("squarify");
const s = require("@supabase/supabase-js");
const chroma = require("chroma-js");

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

    const fileName = `heatmap-${date}-${month}-chart.png`;

    // check if  files exists
    const { data: fetchedFiles, error: fetchedError } =
      await supabase.storage
        .from("moshi-charts")
        .list(undefined, {
          limit: 100,
          search: `heatmap-${date}-${month}`,
        });

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
    const fetchUrl = `http://api.mochi.pod.town/api/v1/defi/market-data`;

    // Create chart data
    const res = await axios.get(fetchUrl);
    const watchlistData = await res.data;
    const filteredData = Object.values(
      watchlistData.data
    ).filter((i) =>
      ["usdc", "usdt", "eth"].includes(
        i.symbol.toLowerCase()
      )
    );

    const chart = await renderHeatmap(filteredData);

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

async function renderHeatmap(data) {
  const container = { x0: 0, y0: 0, x1: 1500, y1: 1200 };
  const { x0, y0, x1, y1 } = container;
  const [l, w] = [x1 - x0, y1 - y0];

  // const totalArea = container.length * container.width
  const totalMarketCap = data.reduce(
    (acc, cur) => acc + cur.market_cap,
    0
  );
  const ratios = data.map(
    (item) => item.market_cap / totalMarketCap
  );
  // const areas = ratios.map((r) => r * totalArea)
  const input = data.map((item, i) => {
    return {
      symbol: item.symbol.toUpperCase(),
      value: item.market_cap,
      // value: ratios[i],
      price: `$${item.current_price.toLocaleString()}`,
      color: getColorScale(
        item.price_change_percentage_24h
      ),
      change_1d: `${item.price_change_percentage_24h.toFixed(
        2
      )}%`,
      change_prefix:
        item.price_change_percentage_24h >= 0 ? "+" : "",
      ratio: ratios[i],
    };
  });

  const output = squarify(input, [], container, []);
  const canvas = createCanvas(l, w);
  const ctx = canvas.getContext("2d");
  output.forEach((item) => {
    const fontSize = adjustFont(
      ctx,
      item.x1 - item.x0,
      300,
      item.symbol
    );
    drawRectangle(
      ctx,
      {
        x: { from: item.x0, to: item.x1 },
        y: { from: item.y0, to: item.y1 },
        w: l,
        h: w,
        radius: 0,
      },
      item.color,
      "white"
    );

    // price (2nd line)
    ctx.font = `${fontSize * 0.6}px Manrope`;
    const priceH = heightOf(ctx, item.price);
    const priceW = widthOf(ctx, item.price);
    const price = {
      text: item.price,
      x: item.x0 + (item.x1 - item.x0) / 2 - priceW / 2,
      y: item.y0 + (item.y1 - item.y0) / 2 + priceH / 2,
      font: ctx.font,
    };

    // symbol (1st line)
    ctx.font = `bold ${fontSize}px Manrope`;
    // const symbolH = heightOf(ctx, item.symbol)
    const symbolW = widthOf(ctx, item.symbol);
    const symbol = {
      text: item.symbol,
      x: item.x0 + (item.x1 - item.x0) / 2 - symbolW / 2,
      y: price.y - priceH - 0.1 * fontSize,
      font: ctx.font,
    };

    // change percentage (3rd line)
    ctx.font = `${fontSize * 0.6}px Manrope`;
    const changeText = `${item.change_prefix}${item.change_1d}`;
    const changeH = heightOf(ctx, changeText);
    const changeW = widthOf(ctx, changeText);
    const change = {
      text: changeText,
      x: item.x0 + (item.x1 - item.x0) / 2 - changeW / 2,
      y: price.y + changeH + 0.15 * fontSize,
      font: ctx.font,
    };

    // fill text
    ctx.fillStyle = "white";
    ctx.font = symbol.font;
    ctx.fillText(symbol.text, symbol.x, symbol.y);
    ctx.font = price.font;
    ctx.fillText(price.text, price.x, price.y);
    ctx.font = change.font;
    ctx.fillText(change.text, change.x, change.y);
  });

  return canvas.toBuffer();
}

function getColorScale(change) {
  const c = Math.abs(change / 10);
  if (change <= 0.05 && change >= -0.05) return "gray";
  if (change > 0)
    return chroma.scale(["#5cc489", "#337350"])(c).hex();
  return chroma.scale(["#b52d29", "#7a0d0a"])(c).hex();
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

function adjustFont(ctx, l, fontSize, text) {
  // minimum font size is 1
  if (fontSize === 0) return 1;
  ctx.font = `bold ${fontSize}px Manrope`;
  const w = widthOf(ctx, text);
  // if text width > 40% of its container's length -> fontSize -= 1
  if (w > 0.4 * l) {
    return adjustFont(ctx, l, fontSize - 1, text);
  }
  // else -> use this
  return fontSize;
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
