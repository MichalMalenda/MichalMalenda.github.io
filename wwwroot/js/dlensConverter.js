// dlensConverter.js
// Client-side parsing of Delver Lens .dlens (SQLite) export/backup files using sql.js (wasm).
// Nothing is uploaded anywhere except optional lookups against the public Scryfall API
// (card name/collector-number resolution) for cards that only carry a scryfall_id, or that
// need OCR-based matching against their embedded photo.

const SQLJS_VERSION = "1.14.2";
const TESSERACT_VERSION = "5.1.1";

let sqlJsPromise = null;
let tesseractPromise = null;

// Populated by parseDatabase(): cardRowId (the `_id` column of `cards`, i.e. DlensCard.Id) -> base64 JPEG.
let lastParsedImages = {};

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) { resolve(); return; }
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

async function ensureSqlJs() {
    if (!sqlJsPromise) {
        sqlJsPromise = (async () => {
            if (!window.initSqlJs) {
                await loadScript(`https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist/sql-wasm.js`);
            }
            return await window.initSqlJs({
                locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist/${file}`
            });
        })();
    }
    return sqlJsPromise;
}

async function ensureTesseract() {
    if (!tesseractPromise) {
        tesseractPromise = (async () => {
            if (!window.Tesseract) {
                await loadScript(`https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.min.js`);
            }
            return window.Tesseract;
        })();
    }
    return tesseractPromise;
}

function queryToObjects(db, sql) {
    let res;
    try {
        res = db.exec(sql);
    } catch (e) {
        return []; // table might not exist in this file variant
    }
    if (!res[0]) return [];
    const columns = res[0].columns;
    return res[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
    });
}

function tableExists(db, name) {
    const rows = queryToObjects(db, `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`);
    return rows.length > 0;
}

function uint8ToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

// ---- OCR text parsing heuristics ----
// Modern MTG cards print "<collector>/<set size> <rarity> <SETCODE> <lang>" along the bottom edge,
// e.g. "042/280 R ZNR EN". We look for that shape first (fast + unambiguous once found), then fall
// back to guessing the card's title from the most letter-dense line (title is printed largest, top-left).

function parseOcrText(rawText) {
    const text = (rawText || "").toUpperCase();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    let collectorGuess = null;
    const collectorRegex = /(\d{1,4})\s*\/\s*\d{1,4}\D{0,15}?\b([A-Z0-9]{3,5})\b/g;
    let match;
    while ((match = collectorRegex.exec(text)) !== null) {
        const num = match[1].replace(/^0+(?=\d)/, "");
        const code = match[2];
        // Skip tokens that are clearly not set codes (pure digits, single repeated letter, language codes alone).
        if (/^\d+$/.test(code)) continue;
        if (["EN", "ES", "FR", "DE", "IT", "PT", "JA", "KO", "RU", "ZH"].includes(code)) continue;
        collectorGuess = { number: num, setCode: code.toLowerCase() };
        break;
    }

    let nameGuess = null;
    for (const line of lines) {
        const cleaned = line.replace(/[^A-Za-z0-9,'\- ]/g, "").trim();
        const letters = (cleaned.match(/[A-Za-z]/g) || []).length;
        if (letters >= 3 && cleaned.length >= 3 && letters / cleaned.length > 0.6) {
            nameGuess = cleaned;
            break;
        }
    }

    return { collectorGuess, nameGuess };
}

async function scryfallLookupByCollector(setCode, number) {
    try {
        const res = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(number)}`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function scryfallLookupByName(name) {
    try {
        const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function toResultCard(scryfallCard) {
    return {
        name: scryfallCard.name,
        set: (scryfallCard.set || "").toUpperCase(),
        collectorNumber: scryfallCard.collector_number || "",
        scryfallId: scryfallCard.id || ""
    };
}

window.dlensConverter = {
    parseDatabase: async function (byteArray) {
        const SQL = await ensureSqlJs();
        const db = new SQL.Database(new Uint8Array(byteArray));
        lastParsedImages = {};

        try {
            const hasFullCardData = tableExists(db, "data_cards") && tableExists(db, "data_names") && tableExists(db, "data_editions");

            const lists = queryToObjects(db, "SELECT _id, name FROM lists");

            const rawCards = queryToObjects(db, `
                SELECT _id, card, foil, quantity, list, note, condition, language,
                       scryfall_id, price_acquired
                FROM cards
            `);

            // Images are pulled separately so the (possibly large) blobs never touch queryToObjects'
            // generic row-object path or get serialized across the JS-interop boundary unnecessarily.
            let imageRowCount = 0;
            try {
                const imgRes = db.exec("SELECT _id, image FROM cards WHERE image IS NOT NULL AND length(image) > 0");
                if (imgRes[0]) {
                    for (const row of imgRes[0].values) {
                        const id = row[0];
                        const blob = row[1];
                        if (blob && blob.length) {
                            lastParsedImages[id] = uint8ToBase64(blob instanceof Uint8Array ? blob : new Uint8Array(blob));
                            imageRowCount++;
                        }
                    }
                }
            } catch (e) {
                // No image column in this file variant — that's fine, OCR just won't be offered.
            }

            let cardInfoById = {};

            if (hasFullCardData) {
                const namesMap = {};
                queryToObjects(db, "SELECT _id, name FROM data_names").forEach(n => { namesMap[n._id] = n.name; });

                const editionsMap = {};
                queryToObjects(db, "SELECT _id, name FROM data_editions").forEach(ed => { editionsMap[ed._id] = ed.name; });

                queryToObjects(db, "SELECT _id, name, edition, number, scryfall_id FROM data_cards").forEach(dc => {
                    cardInfoById[dc._id] = {
                        name: namesMap[dc.name] || "",
                        edition: editionsMap[dc.edition] || "",
                        number: dc.number || "",
                        scryfallId: dc.scryfall_id || ""
                    };
                });
            }

            const cards = rawCards.map(c => {
                const info = cardInfoById[c.card];
                return {
                    id: c._id,
                    card: c.card,
                    foil: c.foil,
                    quantity: c.quantity,
                    list: c.list,
                    note: c.note || "",
                    condition: c.condition || "",
                    language: c.language || "",
                    scryfallId: c.scryfall_id || "",
                    priceAcquired: c.price_acquired || 0,
                    resolvedName: info ? info.name : "",
                    resolvedEdition: info ? info.edition : "",
                    resolvedNumber: info ? info.number : "",
                    resolvedScryfallId: (info && info.scryfallId) ? info.scryfallId : (c.scryfall_id || ""),
                    hasImage: !!lastParsedImages[c._id]
                };
            });

            return {
                hasFullCardData: hasFullCardData,
                lists: lists.map(l => ({ id: l._id, name: l.name })),
                cards: cards,
                imageCount: imageRowCount
            };
        } finally {
            db.close();
        }
    },

    getCardImageDataUrl: function (cardId) {
        const b64 = lastParsedImages[cardId];
        return b64 ? `data:image/jpeg;base64,${b64}` : null;
    },

    // Runs Tesseract.js OCR against each unresolved card's embedded photo, then tries to resolve
    // the result against Scryfall — first by collector number + set code (unambiguous when found),
    // then by fuzzy name match. dotNetRef, if provided, gets progress callbacks via OnOcrProgress.
    ocrResolveCards: async function (cardIds, dotNetRef) {
        const Tesseract = await ensureTesseract();
        const results = [];
        const total = cardIds.length;

        for (let i = 0; i < total; i++) {
            const cardId = cardIds[i];
            const dataUrl = this.getCardImageDataUrl(cardId);

            if (dotNetRef) {
                try { await dotNetRef.invokeMethodAsync("OnOcrProgress", i + 1, total); } catch { /* ignore */ }
            }

            if (!dataUrl) {
                results.push({ cardId, status: "no-image" });
                continue;
            }

            let ocrText = "";
            try {
                const { data } = await Tesseract.recognize(dataUrl, "eng");
                ocrText = data.text || "";
            } catch (e) {
                results.push({ cardId, status: "ocr-failed", imageDataUrl: dataUrl });
                continue;
            }

            const { collectorGuess, nameGuess } = parseOcrText(ocrText);

            if (collectorGuess) {
                const found = await scryfallLookupByCollector(collectorGuess.setCode, collectorGuess.number);
                if (found) {
                    results.push({
                        cardId, status: "matched-collector", ocrText,
                        imageDataUrl: dataUrl, ...toResultCard(found)
                    });
                    continue;
                }
            }

            if (nameGuess) {
                const found = await scryfallLookupByName(nameGuess);
                if (found) {
                    results.push({
                        cardId, status: "suggested-name", ocrText, ocrNameGuess: nameGuess,
                        imageDataUrl: dataUrl, ...toResultCard(found)
                    });
                    continue;
                }
            }

            results.push({ cardId, status: "unmatched", ocrText, imageDataUrl: dataUrl });
        }

        return results;
    },

    // Manual fallback used by the "type the name" review step for cards OCR couldn't match at all.
    lookupCardByName: async function (name) {
        const found = await scryfallLookupByName(name);
        return found ? toResultCard(found) : null;
    },

    downloadFile: function (filename, content) {
        const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};
