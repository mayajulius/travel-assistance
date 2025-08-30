// server/ollama.mjs
export async function ollamaChatMarkdown({ system, user, model }) {
    const res = await fetch("http://127.0.0.1:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user }
            ],
            stream: false
        })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama ${res.status} ${res.statusText}: ${text}`);
    }

    const data = await res.json();
    return data?.message?.content ?? "";
}
