window.SpeedTest = {
    async measure(url, targetBytes) {
        const cacheBust = url.includes("?") ? "&_t=" : "?_t=";
        const start = performance.now();
        const resp = await fetch(url + cacheBust + Math.random(), { cache: "no-store" });
        if (!resp.ok || !resp.body) throw new Error("Fetch failed");
        const reader = resp.body.getReader();
        let received = 0;
        while (received < targetBytes) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
        }
        try { reader.cancel(); } catch { }
        const ms = performance.now() - start;
        const mbps = ms > 0 ? (received * 8) / (ms / 1000) / 1_000_000 : 0;
        return { mbps, bytes: received, ms };
    }
};
