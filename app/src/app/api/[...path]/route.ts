import { dispatch } from "@/server/api";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ path: string[] }> };
const h = async (req: Request, c: Ctx) => dispatch(req, (await c.params).path);
export { h as GET, h as POST, h as PATCH, h as PUT, h as DELETE };
