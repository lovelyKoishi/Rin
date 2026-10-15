import { afterEach, describe, expect, it, mock } from "bun:test";

const getAppFetch = mock();

mock.module("../app-instance", () => ({
  getApp: () => ({
    fetch: getAppFetch,
  }),
}));

describe("handleFetch", () => {
  afterEach(() => {
    getAppFetch.mockReset();
  });

  it("upgrades blog HTTP requests before assets and API while preserving paths and queries", async () => {
    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("asset-body"));
    for (const [path, method] of [["/", "GET"], ["/head.png?version=2", "HEAD"], ["/api/comment?article=1", "POST"]]) {
      const response = await handleFetch(
        new Request(`http://blog.3w3.asia${path}`, { method }),
        { ASSETS: { fetch: assetFetch } } as unknown as Env,
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe(`https://blog.3w3.asia${path}`);
    }
    expect(assetFetch).toHaveBeenCalledTimes(0);
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("redirects old CF-Blog article links on the current origin", async () => {
    const { handleFetch } = await import("../fetch-handler");
    for (const [oldPath, newPath] of [
      ["/article/000003/vfio.html", "/vfio"],
      ["/article/000004/me.html", "/me"],
    ]) {
      const response = await handleFetch(
        new Request(`https://blog.3w3.asia${oldPath}?from=bookmark`),
        {} as Env,
      );
      expect(response.status).toBe(301);
      expect(response.headers.get("Location")).toBe(`https://blog.3w3.asia${newPath}?from=bookmark`);
    }
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("serves static assets directly when the asset exists", async () => {
    getAppFetch.mockResolvedValue(new Response("app-body", { status: 200 }));

    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("asset-body", { status: 200 }));

    const response = await handleFetch(
      new Request("http://localhost/assets/app.js"),
      {
        ASSETS: {
          fetch: assetFetch,
        },
      } as unknown as Env,
    );

    expect(await response.text()).toBe("asset-body");
    expect(assetFetch).toHaveBeenCalledTimes(1);
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("routes /api/blob requests to the app before static assets", async () => {
    getAppFetch.mockResolvedValue(new Response("blob-body", { status: 200 }));

    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("asset-body", { status: 404 }));

    const executionContext = {} as ExecutionContext;
    const response = await handleFetch(
      new Request("http://localhost/api/blob/images/test.txt"),
      {
        ASSETS: {
          fetch: assetFetch,
        },
      } as unknown as Env,
      executionContext,
    );

    expect(await response.text()).toBe("blob-body");
    expect(getAppFetch).toHaveBeenCalledTimes(1);
    expect(assetFetch).toHaveBeenCalledTimes(0);
    expect(new URL(getAppFetch.mock.calls[0][0].url).pathname).toBe("/blob/images/test.txt");
    expect(getAppFetch.mock.calls[0][2]).toBe(executionContext);
  });
});
