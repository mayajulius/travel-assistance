// client/src/ChatMessage.jsx
import React from "react";
import { Avatar, Box, Stack, Typography } from "@mui/material";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import ReactMarkdown from "react-markdown";

export default function ChatMessage({ role, text, children }) {
    const isUser = role === "user";
    const content = (typeof text === "string" ? text : children) ?? "";
    const safe = String(content).trim(); // guard

    return (
        <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent={isUser ? "flex-end" : "flex-start"}>
            {!isUser && (
                <Avatar sx={{ bgcolor: "primary.main" }}>
                    <TravelExploreIcon fontSize="small" />
                </Avatar>
            )}
            <Box
                sx={{
                    maxWidth: { xs: "85%", md: "70%" },
                    px: 2,
                    py: 1.25,
                    bgcolor: isUser ? "rgba(138,180,255,0.15)" : "rgba(255,255,255,0.08)",
                    border: "1px solid",
                    borderColor: "rgba(255,255,255,0.08)",
                    borderRadius: 3
                }}
            >
                <Typography component="div" color="text.primary" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {safe ? <ReactMarkdown>{safe}</ReactMarkdown> : <span style={{ opacity: 0.5 }}>(empty)</span>}
                </Typography>
            </Box>
            {isUser && <Avatar sx={{ bgcolor: "rgba(138,180,255,0.25)" }}>U</Avatar>}
        </Stack>
    );
}
