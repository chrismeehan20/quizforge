# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuizForge v3 is a single-file React application that converts quiz documents (PDF, DOCX, TXT) into Canvas LMS-compatible QTI (Question and Test Interoperability) format. It runs in the browser and can optionally use the Anthropic API for AI-powered quiz parsing.

## Architecture

The entire application lives in `quizforge-v3.jsx` (~2400 lines). Key sections:

1. **Utility Functions** (lines 84-256): File processing helpers
   - `extractTextFromDocx()` / `extractImagesFromDocx()` - Uses JSZip (loaded from CDN)
   - `extractTextFromPdf()` - Uses PDF.js (loaded from CDN)
   - `loadScript()` - Dynamic CDN script loader

2. **Answer Key Parser** (lines 262-351): Handles various answer key formats
   - `parseAnswerKey()` - Parses formats like "1-B, 2-A" or "B A C D"
   - `applyAnswerKey()` - Applies parsed answers to quiz questions

3. **Main Component** (`QuizForge`, line 357): 6-step wizard
   - Step 0: Upload (file drop or text paste)
   - Step 1: Processing (AI or demo mode)
   - Step 2: Edit (question editor with image support)
   - Step 3: Settings (quiz configuration)
   - Step 4: Preview
   - Step 5: Export (QTI XML generation)

4. **Sub-components** (lines 1135-2109): Step-specific UI
   - `UploadStep`, `ProcessingStep`, `EditStep`, `SettingsStep`, `PreviewStep`, `ExportStep`
   - `QuestionEditor`, `AnswerKeyModal`, `ApiKeyModal`, `ImagePreviewModal`

5. **Styles Object** (lines 2116-2375): Inline CSS-in-JS styles

## Key Technical Details

- **No build system**: This is a standalone JSX file meant to be used with a React runtime
- **CDN dependencies**: JSZip and PDF.js are loaded dynamically when needed
- **Anthropic API**: Uses direct browser access (`anthropic-dangerous-direct-browser-access` header) with model `claude-sonnet-4-20250514`
- **Question types supported**: multiple_choice, multiple_select, true_false, short_answer, essay, matching, ordering, fill_blank, numerical
- **Export format**: QTI 1.2 XML (Canvas-compatible)

## Development Notes

- All state management is via React useState hooks in the main `QuizForge` component
- Images are stored as base64 data URLs and embedded directly in the QTI export
- The app has a "demo mode" that works without an API key using regex-based parsing (`parseDemoQuiz`)
