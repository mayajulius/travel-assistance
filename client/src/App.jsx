import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Box, Chip, CircularProgress, Container, CssBaseline, Divider,
    IconButton, InputAdornment, Paper, Stack, TextField, ThemeProvider,
    Typography, createTheme
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import BackpackIcon from "@mui/icons-material/Backpack";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ChatMessage from "./ChatMessage.jsx";

const theme = createTheme({
    palette: {
        mode: "dark",
        primary: { main: "#8ab4ff" },
        background: { default: "#0b1020", paper: "#111834" },
        text: { primary: "#e9ecf1", secondary: "#93a1bf" }
    },
    shape: { borderRadius: 16 }
});

const QUICK_PROMPTS = [
    {
        icon: <BackpackIcon fontSize="small" />,
        label: "Pack for Patagonia in March (10 days, hiking)",
        text: "What should I pack for hiking in Patagonia in March for 10 days?"
    },
    {
        icon: <LocationOnIcon fontSize="small" />,
        label: "4 days in Kyoto in May — what to see",
        text: "Kyoto in May for 4 days — what should I see?"
    },
    {
        icon: <TravelExploreIcon fontSize="small" />,
        label: "Warm beach ideas in November (from Tel Aviv, medium budget)",
        text: "Looking for warm beach destinations in November from Tel Aviv, medium budget."
    }
];

// Use absolute URL to avoid proxy issues; override via client/.env: VITE_API_URL=http://localhost:3001/chat
const API = import.meta.env.VITE_API_URL || "http://localhost:3001/chat";

export default function App() {
    const [messages, setMessages] = useState([
        { role: "assistant", text: "Hi! I can suggest destinations, packing lists, and local attractions. What are you planning?" }
    ]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        }
    }, [messages]);

    const placeholder = useMemo(
        () => (busy ? "Thinking…" : "Ask me anything (Destinations • Packing • Local attractions)"),
        [busy]
    );

    async function send(text) {
        const content = (text ?? input).trim();
        if (!content || busy) return;

        setMessages(prev => [...prev, { role: "user", text: content }]);
        setInput("");
        setBusy(true);

        try {
            const resp = await fetch(API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: content, sessionId: "web" })
            });

            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`${resp.status} ${errText}`);
            }

            const data = await resp.json();
            const reply = (typeof data?.reply === "string" && data.reply.trim()) ? data.reply : "(No reply)";
            setMessages(prev => [...prev, { role: "assistant", text: reply }]);
        } catch (e) {
            console.error(e);
            setMessages(prev => [...prev, { role: "assistant", text: `Request failed: ${String(e.message || e)}` }]);
        } finally {
            setBusy(false);
        }
    }

    function onKeyDown(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    }

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Container maxWidth="md" sx={{ py: 4 }}>
                <Paper elevation={8} sx={{ overflow: "hidden", borderRadius: 4 }}>
                    {/* Header */}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.5, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        <TravelExploreIcon color="primary" />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>Travel Assistant</Typography>

                    </Box>

                    {/* Chat feed */}
                    <Box ref={scrollRef} sx={{ height: { xs: "60vh", md: "70vh" }, overflow: "auto", px: 2, py: 2 }}>
                        <Stack spacing={2}>
                            {messages.map((m, i) => (
                                <ChatMessage key={i} role={m.role} text={m.text} />
                            ))}
                            {busy && (
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ color: "text.secondary" }}>
                                    <CircularProgress size={18} />
                                    <Typography variant="body2">Thinking…</Typography>
                                </Stack>
                            )}
                        </Stack>
                    </Box>

                    <Divider />

                    {/* Quick prompts */}
                    <Box sx={{ px: 2, pt: 1, pb: 1, display: "flex", flexWrap: "wrap", gap: 1 }}>
                        {QUICK_PROMPTS.map((q, idx) => (
                            <Chip key={idx} icon={q.icon} label={q.label} onClick={() => send(q.text)} clickable sx={{ bgcolor: "rgba(255,255,255,0.06)" }} />
                        ))}
                    </Box>

                    <Divider />

                    {/* Composer */}
                    <Box sx={{ p: 2, bgcolor: "rgba(255,255,255,0.03)" }}>
                        <TextField
                            fullWidth
                            multiline
                            minRows={2}
                            maxRows={6}
                            value={input}
                            placeholder={placeholder}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={onKeyDown}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton color="primary" onClick={() => send()} disabled={busy || !input.trim()}>
                                            <SendIcon />
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }}
                        />
                    </Box>
                </Paper>

                <Typography variant="caption" sx={{ display: "block", mt: 1.5, color: "text.secondary" }}>
                    Tip: Try “What should I pack for hiking in Patagonia in March for 10 days?”
                </Typography>
            </Container>
        </ThemeProvider>
    );
}
