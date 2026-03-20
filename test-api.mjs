import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "development-secret";
const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "24h" });

async function check() {
  const res = await fetch("http://localhost:5176/api/admin/sessions", {
    headers: {
      cookie: `admin_token=${token}`
    }
  });
  const data = await res.json();
  console.log("SESSIONS LIST:");
  data.sessions.slice(0, 3).forEach(s => console.log(JSON.stringify(s)));

  if (data.sessions.length > 0) {
    const sId = data.sessions[0].id;
    const res2 = await fetch(`http://localhost:5176/api/admin/sessions/${sId}`, {
      headers: { cookie: `admin_token=${token}` }
    });
    const data2 = await res2.json();
    console.log("\nFULL SESSION:");
    // Print just the participant field
    console.log(JSON.stringify(data2.session.participant, null, 2));
    console.log(JSON.stringify({ "id": data2.session.id, "participantName": data2.session.participantName }));
  }
}

check();
