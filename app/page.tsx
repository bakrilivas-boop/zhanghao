import { requireChatGPTUser } from "./chatgpt-auth";
import Inventory from "./inventory";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <Inventory email={user.email} />;
}
