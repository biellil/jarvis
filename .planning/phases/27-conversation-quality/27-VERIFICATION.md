# Phase 27: Conversation Quality - Verification

**Date:** [YYYY-MM-DD]
**Tester:** [Name]
**Environment:** Docker Compose (ChromaDB service running)

## Test Scenarios

### CONV-07: Portuguese Brazilian Responses

**Requirement:** JARVIS always responds in Portuguese Brazilian regardless of input language

**Test 1.1 - English input**
- Input: "What time is it?"
- Expected: Response in Portuguese (e.g., "São 14:30" or "Desculpe, não tenho acesso ao relógio do sistema")
- Actual: [TO BE FILLED]
- Result: [ ] PASS / [ ] FAIL

**Test 1.2 - Portuguese input**
- Input: "Que horas são?"
- Expected: Response in Portuguese
- Actual: [TO BE FILLED]
- Result: [ ] PASS / [ ] FAIL

**Test 1.3 - Mixed language input**
- Input: "My name is João e eu trabalho em tech"
- Expected: Response in Portuguese acknowledging name and work
- Actual: [TO BE FILLED]
- Result: [ ] PASS / [ ] FAIL

### CONV-08: Cross-Session Memory

**Requirement:** JARVIS recovers context from previous conversations via ChromaDB

**Setup:** Session 1
- Input 1: "Meu nome é Pedro e eu moro em São Paulo"
- Input 2: "Eu trabalho como desenvolvedor"
- Input 3: "Minha linguagem favorita é TypeScript"
- [Wait for ChromaDB indexing, close session]

**Test 2.1 - Name recall (Session 2)**
- Input: "Qual é o meu nome?"
- Expected: Response mentions "Pedro" without user repeating it
- Actual: [TO BE FILLED]
- Result: [ ] PASS / [ ] FAIL

**Test 2.2 - Location recall (Session 2)**
- Input: "Onde eu moro?"
- Expected: Response mentions "São Paulo"
- Actual: [TO BE FILLED]
- Result: [ ] PASS / [ ] FAIL

**Test 2.3 - Preference recall (Session 2)**
- Input: "Qual é minha linguagem favorita?"
- Expected: Response mentions "TypeScript"
- Actual: [TO BE FILLED]
- Result: [ ] PASS / [ ] FAIL

### CONV-09: recall_memory Tool E2E

**Requirement:** recall_memory tool returns real ChromaDB results when invoked

**Test 3.1 - Tool invocation logs**
- Action: Review backend logs during Session 2 tests above
- Expected: Log entries showing `recall_memory` tool calls with query strings
- Actual: [TO BE FILLED - paste relevant log lines]
- Result: [ ] PASS / [ ] FAIL

**Test 3.2 - Non-empty results**
- Action: Check tool response in logs
- Expected: Tool returns results with similarity scores >0.7, not "Nenhuma memória relevante encontrada"
- Actual: [TO BE FILLED - paste tool response from logs]
- Result: [ ] PASS / [ ] FAIL

**Test 3.3 - ChromaDB query verification**
- Action: Verify ChromaDB contains indexed memories from Session 1
- Command: `docker compose exec backend-ts node -e "import('./dist/memory/vectors.js').then(async ({MemoryVectors}) => { const v = new MemoryVectors({host: 'chromadb'}); const results = await v.queryMemories('Pedro São Paulo', 5, 0.5); console.log('Results:', results); })"`
- Expected: Query returns results containing "Pedro" and "São Paulo" references
- Actual: [TO BE FILLED]
- Result: [ ] PASS / [ ] FAIL

## Overall Results

- [ ] All CONV-07 tests passed (3/3)
- [ ] All CONV-08 tests passed (3/3)
- [ ] All CONV-09 tests passed (3/3)

**Phase 27 verification:** [ ] APPROVED / [ ] NEEDS FIXES

**Tester signature:** _______________  **Date:** _______________

## Notes

**System prompt verification:**
- File: `apps/backend-ts/src/session/system-prompt.ts`
- Content: "Sempre responda em português brasileiro."

**Dynamic topK implementation:**
- File: `apps/backend-ts/src/memory/manager.ts`
- Implementation: `queryMemories(userText, 10, 0.7)` — max 10 results with similarity >0.7

**ChromaDB service:**
- Docker Compose service: `chromadb`
- Backend connection: `CHROMA_HOST=chromadb` (Docker internal DNS)
