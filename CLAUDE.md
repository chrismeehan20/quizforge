# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuizForge v3 is a single-file React application that converts quiz documents (PDF, DOCX, TXT) into Canvas LMS-compatible QTI (Question and Test Interoperability) format. It runs in the browser and can optionally use the Anthropic API for AI-powered quiz parsing.

## Architecture

The entire application lives in `quizforge-v3.jsx` (~3100 lines). Key sections:

1. **Utility Functions** (lines 61-650): File processing and math helpers
   - `extractTextFromDocx()` / `extractImagesFromDocx()` - Uses JSZip (loaded from CDN)
   - `extractTextFromPdf()` - Uses PDF.js (loaded from CDN)
   - `extractOmmlFromDocx()` - Extracts MathType/OMML equations as LaTeX
   - `loadScript()` / `loadStylesheet()` - Dynamic CDN loaders
   - `loadRichTextLibraries()` - Loads KaTeX, marked.js, html2canvas
   - `latexToImage()` / `processTextForQTI()` - Math-to-image conversion for export
   - `containsMath()` / `containsMarkdown()` - Content detection helpers

2. **Answer Key Parser** (lines 660-750): Handles various answer key formats
   - `parseAnswerKey()` - Parses formats like "1-B, 2-A" or "B A C D"
   - `applyAnswerKey()` - Applies parsed answers to quiz questions

3. **Main Component** (`QuizForge`, line 1359): 6-step wizard
   - Step 0: Upload (file drop or text paste)
   - Step 1: Processing (AI or demo mode)
   - Step 2: Edit (question editor with math toolbar and preview)
   - Step 3: Settings (quiz configuration)
   - Step 4: Preview (with rendered math/markdown)
   - Step 5: Export (QTI XML generation with math as images)

4. **Sub-components** (lines 2900-4500): Step-specific UI
   - `UploadStep`, `ProcessingStep`, `EditStep`, `SettingsStep`, `PreviewStep`, `ExportStep`
   - `QuestionEditor` - Includes math toolbar and Edit/Preview toggle
   - `RichTextRenderer` - Renders LaTeX math and Markdown
   - `AnswerKeyModal`, `ApiKeyModal`, `ImagePreviewModal`

5. **Styles Object** (lines 4500-4850): Inline CSS-in-JS styles

## Key Technical Details

- **No build system**: This is a standalone JSX file meant to be used with a React runtime
- **CDN dependencies**: Loaded dynamically when needed:
  - JSZip - DOCX/ZIP file handling
  - PDF.js - PDF text extraction
  - KaTeX - LaTeX math rendering
  - marked.js - Markdown parsing
  - html2canvas - Math-to-image conversion for export
- **Anthropic API**: Uses direct browser access (`anthropic-dangerous-direct-browser-access` header) with model `claude-sonnet-4-20250514`
- **Question types supported**: multiple_choice, multiple_select, true_false, short_answer, essay, matching, ordering, fill_blank, numerical
- **Export format**: QTI 1.2 XML (Canvas-compatible)

## Math and Markdown Support

- **LaTeX syntax**: Use `$...$` for inline math, `$$...$$` for display math
- **Markdown**: Supports `**bold**`, `*italic*`, `` `code` ``
- **Word import**: MathType/OMML equations are automatically converted to LaTeX
- **QTI export**: Math expressions are rendered as PNG images with LaTeX as alt text for Canvas compatibility
- **Editor features**: Math toolbar with common symbols (fractions, roots, exponents) and Edit/Preview toggle

## Development Notes

- All state management is via React useState hooks in the main `QuizForge` component
- Images are stored as base64 data URLs and embedded directly in the QTI export
- Math is rendered live in preview but converted to images on export for LMS compatibility
- The app has a "demo mode" that works without an API key using regex-based parsing (`parseDemoQuiz`)
