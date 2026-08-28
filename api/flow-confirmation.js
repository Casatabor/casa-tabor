const crypto = require("node:crypto");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Método no permitido");
  }

  try {
    const token = req.body?.token;

    if (!token) {
      return res.status(400).send("Falta token de Flow");
    }

    const apiKey = process.env.FLOW_API_KEY;
    const secretKey = process.env.FLOW_SECRET_KEY;

    if (!apiKey || !secretKey) {
      return res.status(500).send("Faltan credenciales de Flow");
    }

    const params = {
      apiKey,
      token,
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

    const query = new URLSearchParams({
      ...params,
      s: signature,
    });

    const response = await fetch(
      `https://www.flow.cl/api/payment/getStatus?${query.toString()}`
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Error consultando Flow:", data);
      return res.status(400).send("No fue posible consultar el pago");
    }

    console.log("Pago recibido desde Flow:", {
      flowOrder: data.flowOrder,
      commerceOrder: data.commerceOrder,
      status: data.status,
      amount: data.amount,
      payer: data.payer,
    });

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Error en confirmación Flow:", error);
    return res.status(500).send("Error");
  }
};
