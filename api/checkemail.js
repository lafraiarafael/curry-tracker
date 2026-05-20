module.exports = async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    route: "checkemail",
    time: new Date().toISOString(),
  });
};