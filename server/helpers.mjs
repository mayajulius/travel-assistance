// helpers.mjs (or inline above your nodes)
export const toNumber = (v) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
        const n = Number(v.trim());
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
};

export const toString = (v) => (typeof v === "string" ? v.trim() : "");

export const toStringArray = (v) => {
    if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
    if (typeof v === "string") {
        return v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }
    return [];
};

// Field-level normalizer by key
export const normalizeEntities = (entities) => {
    const e = { ...entities };
    if ("trip_length_days" in e) {
        const n = toNumber(e.trip_length_days);
        if (n && n > 0) e.trip_length_days = n; else delete e.trip_length_days;
    }
    if ("month_or_season" in e) e.month_or_season = toString(e.month_or_season);
    if ("destination" in e) e.destination = toString(e.destination);
    if ("interests" in e) e.interests = toStringArray(e.interests);
    if ("budget" in e) e.budget = toString(e.budget);
    return e;
};

// Single source of truth for "is missing"
export const isMissingField = (field, value) => {
    if (field === "trip_length_days") return !(Number.isFinite(value) && value > 0);
    if (field === "interests") return !Array.isArray(value) || value.length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return !value || (typeof value === "string" && !value.trim());
};
