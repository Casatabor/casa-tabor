const crypto = require("node:crypto");
const querystring = require("node:querystring");

const PRODUCTS = {
  "pinza-eliza": { price: 8000, variants: { "Talla única": 2 } },
  "aros-cruz-sagrado-corazon": { price: 8500, variants: { "Talla única": 1 } },
  "pendientes-candados-corazon": { price: 6500, variants: { "Talla única": 1 } },
  "aros-reina-victoria": { price: 10000, variants: { "Talla única": 1 } },
  "cadena-sagrado-corazon-brillos": { price: 12000, variants: { "Talla única": 1 } },
  "collar-acero-corazon-plata": { price: 12990, variants: { "Talla única": 1 } },
  "panuelo-beige-sagrado-corazon": { price: 12500, variants: { "Talla única": 1 } },
  "pulsera-san-benito": { price: 3500, variants: { Ajustable: 3 } },
  "pulsera-proteccion-virgen-maria": { price: 5000, variants: { Ajustable: 3 } },

  "anillo-vintage-burdel": {
    price: 7500,
    variants: { "7": 1, "8": 1 }
  },

  "anillo-san-benito-bicolor": {
    price: 12000,
    variants: { "7": 1, "8": 1 }
  },

  "anillo-mater": {
    price: 5500,
    variants: { "8": 1 }
  },

  "anillo-rombo-rojo": {
    price: 7500,
    variants: { "7": 1 }
  },

  "anillo-san-benito-dorado": {
    price: 12000,
    variants: { "9": 1 }
  },

  "conjunto-diamante": {
    price: 6500,
    variants: { "7": 1 }
  },

  "anillo-brillante-corazon": {
    price: 7000,
    variants: { "8": 1 }
  },

  "anillo-ovalado-sagrado-corazon": {
    price: 4500,
    variants: { Ajustable: 1 }
  },

  "anillo-exvoto": {
    price: 7500,
    variants: { "7": 1 }
  },

  "collar-san-benito": {
    price: 15000,
    variants: { "Talla única": 1 }
  },

  "anillo-quintillizo-corazon": {
    price: 7500,
    variants: { "7": 1 }
  },

  "anillo-corazon-ajustable": {
    price: 5500,
    variants: { "7 / ajustable": 1 }
  },
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


function shippingCost(region) {
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


    if (
      !VALID_REGIONS.has(region) ||
      customer.region !== region
    ) {
      return res.status(400).json({
        error: "Región de despacho inválida"
      });
    }


    const nombre = clean(customer.nombre, 120);
    const telefono = clean(customer.telefono, 40);
    const direccion = clean(customer.direccion, 180);
    const depto = clean(customer.depto, 80);
    const comuna = clean(customer.comuna, 100);
    const payerEmail = clean(email, 160);


    if (
      !nombre ||
      !telefono ||
      !direccion ||
      !comuna ||
      !payerEmail
    ) {
      return res.status(400).json({
        error: "Faltan datos de despacho"
      });
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
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        return res.status(400).json({
          error: "El carrito contiene un producto inválido"
        });
      }


      const stock = product.variants[variant];


      if (!stock || quantity > stock) {
        return res.status(400).json({
          error: "Cantidad o talla sin stock disponible"
        });
      }


      subtotal += product.price * quantity;


      normalizedItems.push({
        id,
        v: variant,
        q: quantity
      });
    }


    const despacho = shippingCost(region);

    const total = subtotal + despacho;


    const apiKey = process.env.FLOW_API_KEY;
    const secretKey = process.env.FLOW_SECRET_KEY;


    if (!apiKey || !secretKey) {
      return res.status(500).json({
        error: "Faltan las credenciales de Flow"
      });
    }


    const commerceOrder = `TABOR-${Date.now()}`;


    const optional = JSON.stringify({
      n: nombre,
      t: telefono,
      d: direccion,
      x: depto,
      c: comuna,
      r: region,
      s: despacho,
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
      "https://sandbox.flow.cl/api/payment/create",
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

      total
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
