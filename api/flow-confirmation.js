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

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!apiKey || !secretKey) {
      return res.status(500).send("Faltan credenciales de Flow");
    }

    if (!supabaseUrl || !supabaseSecretKey) {
      return res.status(500).send("Faltan credenciales de Supabase");
    }

    // ------------------------------------------------
    // 1. Consultar estado real del pago en Flow
    // ------------------------------------------------

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

    // ------------------------------------------------
    // 2. Solo descontamos stock si el pago está PAGADO
    // Flow status 2 = pagado
    // ------------------------------------------------

    if (Number(data.status) !== 2) {
      console.log(
        "Pago aún no confirmado. No se modifica stock.",
        data.status
      );

      return res.status(200).send("OK");
    }

    // ------------------------------------------------
    // 3. Recuperar productos enviados originalmente
    // ------------------------------------------------

    let optional = data.optional || {};

    if (typeof optional === "string") {
      try {
        optional = JSON.parse(optional);
      } catch {
        optional = {};
      }
    }

    let items = optional.i || [];

    if (typeof items === "string") {
      try {
        items = JSON.parse(items);
      } catch {
        items = [];
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      console.error(
        "Pago confirmado pero no encontramos productos en optional.i:",
        optional
      );

      return res.status(500).send(
        "Pago confirmado, pero faltan datos del pedido"
      );
    }

    const normalizedItems = items.map((item) => ({
      id: String(item.id || ""),
      variant: String(item.variant || ""),
      quantity: Number(item.quantity || 0),
    }));

    const invalidItem = normalizedItems.find(
      (item) =>
        !item.id ||
        !item.variant ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
    );

    if (invalidItem) {
      console.error("Item inválido:", invalidItem);

      return res.status(500).send(
        "Pago confirmado, pero los productos son inválidos"
      );
    }

    // ------------------------------------------------
    // 4. Descontar stock en Supabase
    // La función también evita descontar dos veces
    // ------------------------------------------------

    const stockResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/process_flow_payment`,
      {
        method: "POST",
        headers: {
          apikey: supabaseSecretKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_commerce_order: String(data.commerceOrder),
          p_items: normalizedItems,
        }),
      }
    );

    const stockResultText = await stockResponse.text();

    if (!stockResponse.ok) {
      console.error(
        "Error descontando stock en Supabase:",
        stockResultText
      );

      return res.status(500).send(
        "Pago confirmado, pero no se pudo actualizar stock"
      );
    }

    let stockResult = {};

    try {
      stockResult = JSON.parse(stockResultText);
    } catch {
      stockResult = stockResultText;
    }

    console.log("Stock actualizado correctamente:", {
      commerceOrder: data.commerceOrder,
      result: stockResult,
    });

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Error en confirmación Flow:", error);

    return res.status(500).send("Error");
  }
};
