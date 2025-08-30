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
        mode: "light",
        primary: { main: "#1976d2" }, // Sky blue
        secondary: { main: "#f57c00" }, // Orange accent
        background: {
            default: "#f2f7fb", // Soft cloudy background
            paper: "#ffffff"
        },
        text: {
            primary: "#1e2a38",
            secondary: "#5c6b7a"
        }
    },
    shape: {
        borderRadius: 16
    },
    typography: {
        fontFamily: '"Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
    }
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
                <Paper elevation={6} sx={{ overflow: "hidden", borderRadius: 4, background: "linear-gradient(to top, #ffffff, #e8f0fb)" }}>
                    <Box sx={{
                        display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 2,
                        borderBottom: "1px solid #e0e0e0"
                    }}>
                        <TravelExploreIcon color="primary" />
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>AI Travel Assistant</Typography>
                    </Box>
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
                    <Box sx={{ px: 2, pt: 1, pb: 1, display: "flex", flexWrap: "wrap", gap: 1 }}>
                        {QUICK_PROMPTS.map((q, idx) => (
                            <Chip
                                key={idx}
                                icon={q.icon}
                                label={q.label}
                                onClick={() => send(q.text)}
                                clickable
                                variant="outlined"
                                sx={{
                                    borderColor: "primary.main",
                                    color: "primary.main",
                                    fontWeight: 500,
                                    backgroundColor: "white",
                                    '&:hover': {
                                        backgroundColor: "#e3f2fd"
                                    }
                                }}
                            />                        ))}
                    </Box>
                    <Divider />
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