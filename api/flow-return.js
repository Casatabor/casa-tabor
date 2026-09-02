const crypto = require("node:crypto"); 
 
module.exports = async function handler(req, res) { 
  if (req.method !== "POST") { 
    return res.redirect(302, "/"); 
  } 
 
  try { 
    const token = req.body?.token; 
 
    if (!token) { 
      return res.redirect(302, "/?pago=error"); 
    } 
 
    const apiKey = process.env.FLOW_API_KEY; 
    const secretKey = process.env.FLOW_SECRET_KEY; 
 
    if (!apiKey || !secretKey) { 
      return res.redirect(302, "/?pago=error"); 
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
      console.error("Error consultando estado Flow:", data);
      return res.redirect(302, "/?pago=error");
    }

    if (data.status === 2) {
  return res.redirect(302, "/gracias.html");
}

    if (data.status === 3 || data.status === 4) {
      return res.redirect(302, "/?pago=rechazado");
    }

    return res.redirect(302, "/?pago=pendiente");
  } catch (error) {
    console.error("Error en retorno Flow:", error);
    return res.redirect(302, "/?pago=error");
  }
};
