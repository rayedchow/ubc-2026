import { ServiceError } from "./service";

/** Runs a handler and turns ServiceError into a JSON error response. */
export async function respond<T>(work: () => T | Promise<T>, okStatus = 200): Promise<Response> {
  try {
    return Response.json(await work(), { status: okStatus });
  } catch (err) {
    if (err instanceof ServiceError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ServiceError(400, "Invalid JSON.");
  }
}
