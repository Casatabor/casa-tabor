export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/Stock%20Casa%20Tabor?select=product_id,product_name,variant,stock`,
      {
        headers: {
          apikey: process.env.SUPABASE_SECRET_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error Supabase:", errorText);

      return res.status(500).json({
        error: "No se pudo obtener el stock",
      });
    }

    const stock = await response.json();

    return res.status(200).json(stock);
  } catch (error) {
    console.error("Error consultando stock:", error);

    return res.status(500).json({
      error: "Error interno",
    });
  }
}
