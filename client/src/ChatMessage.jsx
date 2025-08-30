import React from "react";
import {Avatar, Box, Stack, Typography} from "@mui/material";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import ReactMarkdown from "react-markdown";

export default function ChatMessage({role, text, children}) {
    const isUser = role === "user";
    const content = (typeof text === "string" ? text : children) ?? "";

    // Clean the content to fix spacing issues
    const cleanContent = String(content)
        .trim()
        .replace(/\n{3,}/g, '\n\n')           // Replace 3+ line breaks with 2
        .replace(/^\s*\n/gm, '\n')            // Remove lines with just whitespace
        .replace(/[ \t]+$/gm, '')             // Remove trailing spaces on each line
        .replace(/\n\s*\n\s*\n/g, '\n\n');    // Ensure max 2 consecutive line breaks

    return (
        <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent={isUser ? "flex-end" : "flex-start"}>
            {!isUser && (
                <Avatar sx={{bgcolor: "primary.main"}}>
                    <TravelExploreIcon fontSize="small"/>
                </Avatar>
            )}
            <Box
                sx={{
                    maxWidth: {xs: "85%", md: "70%"},
                    px: 2,
                    py: 1.25,
                    bgcolor: isUser ? "rgba(138,180,255,0.15)" : "rgba(255,255,255,0.08)",
                    border: "1px solid",
                    borderColor: "rgba(255,255,255,0.08)",
                    borderRadius: 3
                }}
            >
                <Typography
                    component="div"
                    color="text.primary"
                    sx={{
                        lineHeight: 1.6,
                        '& p': {
                            margin: '0.5rem 0',
                            '&:first-of-type': {marginTop: 0},
                            '&:last-of-type': {marginBottom: 0}
                        },
                        '& ul, & ol': {
                            margin: '0.5rem 0',
                            paddingLeft: '1.5rem'
                        },
                        '& li': {
                            margin: '0.25rem 0'
                        },
                        '& h1, & h2, & h3, & h4, & h5, & h6': {
                            margin: '1rem 0 0.5rem 0',
                            '&:first-of-type': {marginTop: 0}
                        },
                        '& strong': {
                            fontWeight: 600
                        }
                    }}
                >
                    {cleanContent ? (
                        <ReactMarkdown
                            components={{
                                // Custom components to control spacing
                                p: ({children}) => <p style={{margin: '0.5rem 0'}}>{children}</p>,
                                ul: ({children}) => <ul
                                    style={{margin: '0.5rem 0', paddingLeft: '1.5rem'}}>{children}</ul>,
                                ol: ({children}) => <ol
                                    style={{margin: '0.5rem 0', paddingLeft: '1.5rem'}}>{children}</ol>,
                                li: ({children}) => <li style={{margin: '0.25rem 0'}}>{children}</li>
                            }}
                        >
                            {cleanContent}
                        </ReactMarkdown>
                    ) : (
                        <span style={{opacity: 0.5}}>(empty)</span>
                    )}
                </Typography>
            </Box>
            {isUser && <Avatar sx={{bgcolor: "rgba(138,180,255,0.25)"}}>U</Avatar>}
        </Stack>
    );
}