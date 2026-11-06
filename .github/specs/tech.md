# Technical Architecture — FileFlow

Refer to `PROJECT.md` and `PRD_dan_Prompt_Web_FileFlow/PROMPT_WEB_FileFlow.md`.

## Tech Stack
- Next.js 14 App Router (React, TypeScript strict mode)
- Tailwind CSS
- Sharp (Image processing & local alpha-channel background removal)
- Vitest for automated testing
- Ephemeral private storage `.storage/jobs/` with ownerToken auth & magic bytes detection

