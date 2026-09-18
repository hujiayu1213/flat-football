/* global process */
import "dotenv/config";
import pg from "pg";

async function main() {
  const phone = process.argv[2];
  if (!/^1[3-9]\d{9}$/.test(phone ?? "")) throw new Error("Pass an existing mainland China phone number");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const user = await pool.query("SELECT id, status FROM users WHERE phone = $1", [phone]);
    if (!user.rows[0]) throw new Error("Account not found. Sign in with this phone first.");
    if (user.rows[0].status !== "active") throw new Error("Cannot grant admin to a suspended account.");
    await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING", [user.rows[0].id]);
    process.stdout.write(`Admin role granted to ${phone.slice(0, 3)}****${phone.slice(-4)}.\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
