const crypto = require("node:crypto");
const querystring = require("node:querystring");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { amount, email, subject } = req.body || {};

    if (!amount || !email) {
      return res.status(400).json({
        error: "Faltan datos para crear el pago",
      });
    }

    const apiKey = process.env.FLOW_API_KEY;
    const secretKey = process.env.FLOW_SECRET_KEY;

    if (!apiKey || !secretKey) {
      return res.status(500).json({
        error: "Faltan las credenciales de Flow",
      });
    }

    const params = {
      apiKey,
      commerceOrder: `TABOR-${Date.now()}`,
      subject: subject || "Compra Casa Tabor",
      currency: "CLP",
      amount: Math.round(Number(amount)),
      email,
      urlConfirmation:
        "https://casatabor.vercel.app/api/flow-confirmation",
      urlReturn:
        "https://casatabor.vercel.app/pago.html",
    };

    const keys = Object.keys(params).sort();

    let toSign = "";

    for (const key of keys) {
      toSign += key + params[key];
    }

    const signature = crypto
      .createHmac("sha256", secretKey)
      .update(toSign)
      .digest("hex");

    const body = {
      ...params,
      s: signature,
    };

    const response = await fetch(
      "https://sandbox.flow.cl/api/payment/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: querystring.stringify(body),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Flow error:", data);

      return res.status(response.status).json({
        error: "Flow rechazó la creación del pago",
        details: data,
      });
    }

    const paymentUrl = `${data.url}?token=${data.token}`;

    return res.status(200).json({
      paymentUrl,
      flowOrder: data.flowOrder,
    });
  } catch (error) {
    console.error("Error creando pago:", error);

    return res.status(500).json({
      error: "No se pudo crear el pago",
    });
  }
};
