export default async function handler(req, res) {
  const { id, camp } = req.query;

  console.log("Clique recebido:", {
    telefone: id,
    campanha: camp,
    data: new Date().toISOString(),
  });

  return res.redirect(302, "https://currypasta.menudino.com/");
}