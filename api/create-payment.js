const crypto = require("node:crypto");
const querystring = require("node:querystring");

// Los PRECIOS siguen aquí para que el cliente no pueda alterarlos.
// El STOCK ya NO se toma de aquí: se consulta en Supabase.
const PRODUCTS = {
  "pinza-eliza": { price: 8000 },
  "aros-cruz-sagrado-corazon": { price: 8500 },
  "pendientes-candados-corazon": { price: 6500 },
  "aros-reina-victoria": { price: 10000 },
  "cadena-sagrado-corazon-brillos": { price: 12000 },
  "collar-acero-corazon-plata": { price: 12990 },
  "panuelo-beige-sagrado-corazon": { price: 12500 },
  "pulsera-san-benito": { price: 3500 },
  "pulsera-proteccion-virgen-maria": { price: 5000 },
  "anillo-vintage-burdel": { price: 7500 },
  "anillo-san-benito-bicolor": { price: 12000 },
  "anillo-mater": { price: 5500 },
  "anillo-rombo-rojo": { price: 7500 },
  "anillo-san-benito-dorado": { price: 12000 },
  "conjunto-diamante": { price: 6500 },
  "anillo-brillante-corazon": { price: 7000 },
  "anillo-ovalado-sagrado-corazon": { price: 4500 },
  "anillo-exvoto": { price: 7500 },
  "collar-san-benito": { price: 15000 },
  "anillo-quintillizo-corazon": { price: 7500 },
  "anillo-corazon-ajustable": { price: 5500 },
};

const VALID_REGIONS = new Set([
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana",
  "O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén",
  "Magallanes"
]);

function shippingCost(region, deliveryMethod) {
  if (deliveryMethod === "pickup") {
    return 0;
  }

  if (region === "Metropolitana") {
    return 3990;
  }

  const extreme = new Set([
    "Arica y Parinacota",
    "Tarapacá",
    "Antofagasta",
    "Aysén",
    "Magallanes"
  ]);

  return extreme.has(region) ? 5990 : 4990;
}

function clean(value, max = 180) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

async function getSupabaseStock() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Faltan credenciales de Supabase");
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/Stock%20Casa%20Tabor?select=product_id,variant,stock`,
    {
      headers: {
        apikey: supabaseSecretKey,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Error consultando stock en Supabase:", errorText);
    throw new Error("No fue posible consultar el stock");
  }

  return await response.json();
}

module.exports = async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido"
    });
  }

  try {

    const {
      email,
      subject,
      region,
      deliveryMethod,
      customer,
      items
    } = req.body || {};

    if (
      !email ||
      !customer ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        error: "Faltan datos para crear el pago"
      });
    }

    const isPickup = deliveryMethod === "pickup";

    if (!isPickup) {
      if (
        !VALID_REGIONS.has(region) ||
        customer.region !== region
      ) {
        return res.status(400).json({
          error: "Región de despacho inválida"
        });
      }
    }

    const nombre = clean(customer.nombre, 120);
    const telefono = clean(customer.telefono, 40);

    const direccion = isPickup
      ? "Retiro en Las Condes"
      : clean(customer.direccion, 180);

    const depto = isPickup
      ? ""
      : clean(customer.depto, 80);

    const comuna = isPickup
      ? "Las Condes"
      : clean(customer.comuna, 100);

    const customerRegion = isPickup
      ? "Metropolitana"
      : clean(customer.region, 100);

    const payerEmail = clean(email, 160);

    if (
      !nombre ||
      !telefono ||
      !payerEmail
    ) {
      return res.status(400).json({
        error: "Faltan datos de contacto"
      });
    }

    if (
      !isPickup &&
      (!direccion || !comuna || !customerRegion)
    ) {
      return res.status(400).json({
        error: "Faltan datos de despacho"
      });
    }

    // ---------------------------------------------
    // STOCK REAL DESDE SUPABASE
    // ---------------------------------------------

    const stockRows = await getSupabaseStock();

    const stockMap = {};

    for (const row of stockRows) {
      const key = `${row.product_id}|||${row.variant}`;
      stockMap[key] = Number(row.stock) || 0;
    }

    let subtotal = 0;

    const normalizedItems = [];

    for (const rawItem of items) {

      const id = clean(rawItem?.id, 100);
      const variant = clean(rawItem?.variant, 80);
      const quantity = Number(rawItem?.quantity);

      const product = PRODUCTS[id];

      if (
        !product ||
        !variant ||
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        return res.status(400).json({
          error: "El carrito contiene un producto inválido"
        });
      }

      const stockKey = `${id}|||${variant}`;
      const availableStock = stockMap[stockKey];

      if (
        availableStock === undefined ||
        quantity > availableStock
      ) {
        return res.status(400).json({
          error:
            "Uno de los productos ya no tiene stock suficiente. Actualiza tu carrito e intenta nuevamente."
        });
      }

      subtotal += product.price * quantity;

      // IMPORTANTE:
      // Flow confirmation espera exactamente estas claves.
      normalizedItems.push({
        id,
        variant,
        quantity
      });
    }

    const finalRegion = isPickup
      ? "Metropolitana"
      : region;

    const despacho = shippingCost(
      finalRegion,
      deliveryMethod
    );

    const total = subtotal + despacho;

    const apiKey = process.env.FLOW_API_KEY;
    const secretKey = process.env.FLOW_SECRET_KEY;

    if (!apiKey || !secretKey) {
      return res.status(500).json({
        error: "Faltan las credenciales de Flow"
      });
    }

    const commerceOrder =
      `TABOR-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

    const optional = JSON.stringify({
      n: nombre,
      t: telefono,
      d: direccion,
      x: depto,
      c: comuna,
      r: finalRegion,
      s: despacho,
      e: isPickup
        ? "Retiro en Las Condes"
        : "Envío a domicilio",

      // Estos datos los recibirá flow-confirmation.js
      // para descontar exactamente lo comprado.
      i: normalizedItems
    });

    const params = {

      apiKey,

      commerceOrder,

      subject: clean(
        subject || "Compra Casa Tabor",
        120
      ),

      currency: "CLP",

      amount: total,

      email: payerEmail,

      urlConfirmation:
        "https://casatabor.vercel.app/api/flow-confirmation",

      urlReturn:
        "https://casatabor.vercel.app/api/flow-return",

      optional
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

    const response = await fetch(
      "https://www.flow.cl/api/payment/create",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body: querystring.stringify({
          ...params,
          s: signature
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {

      console.error(
        "Flow error:",
        data
      );

      return res.status(response.status).json({

        error:
          "Flow rechazó la creación del pago",

        details: data
      });
    }

    return res.status(200).json({

      paymentUrl:
        `${data.url}?token=${data.token}`,

      flowOrder:
        data.flowOrder,

      commerceOrder,

      subtotal,

      despacho,

      total,

      deliveryMethod:
        isPickup ? "pickup" : "shipping"
    });

  } catch (error) {

    console.error(
      "Error creando pago:",
      error
    );

    return res.status(500).json({
      error:
        "No se pudo crear el pago"
    });
  }
};
