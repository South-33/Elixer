# AI Agent Test Suite for Elixer

This document outlines a suite of test questions to verify the functionality of the AI agent in Elixer, primarily focusing on the logic within `chatAI.ts` and `agentTools.ts`.

## I. Testing `no_tool` and Direct Response Logic (Agent Mode ON)

These questions aim to test `rankInformationSources`, `parseToolGroupsFromNaturalLanguage` (especially the `===DIRECT_RESPONSE_START/END===` markers), and the "OPTIMIZATION" path in `processQueryWithTools`.

**Note:** Each test case in this section should be run in a **new, separate conversation** to ensure no prior context interferes.

### 1. Question: "Hello there."
*   **Conversation:** Start a new conversation for this test.
*   **Expected Log Behavior:**
    *   `rankInformationSources` receives a response from the LLM likely containing `===DIRECT_RESPONSE_START===...===DIRECT_RESPONSE_END===`.
    *   `parseToolGroupsFromNaturalLanguage` successfully extracts the direct response using specific markers.
    *   `no_tool` is ranked first.
    *   `processQueryWithTools` takes the "OPTIMIZATION: Using direct response from ranking" path.
    *   No call to `NoToolExecutor.execute()` or `callFinalLLMSynthesis`.
    *   The final AI response should be a simple greeting.

### 2. Question: "Okay, sounds good."
*   **Conversation:** Start a new conversation for this test.
*   **Expected Log Behavior:** Similar to Q1.

### 3. Question: "Is the sky blue?"
*   **Conversation:** Start a new conversation for this test.
*   **(A simple factual question the LLM might answer directly without tools)**
*   **Expected Log Behavior:** Similar to Q1, assuming the ranking LLM decides no tools are needed.

## II. Testing Specific Tool Executors (Agent Mode ON)

These questions are designed to trigger specific tool executors.

**Note:** Each test case in this section should be run in a **new, separate conversation**.

### 4. Question: "What is the latest news about AI regulations in Europe?"
*   **Conversation:** Start a new conversation for this test.
*   **(Should trigger web search)**
*   **Expected Log Behavior:**
    *   `rankInformationSources` ranks `search_web` highly.
    *   `WebSearchExecutor.execute()` is called.
    *   Logs from `WebSearchExecutor` indicating search queries and results.
    *   `callFinalLLMSynthesis` is called with `search_web` as a source.
    *   The final AI response should be based on web search results.

### 5. Question: "What does the Cambodian Law on Insurance say about policy termination?"
*   **Conversation:** Start a new conversation for this test.
*   **Expected Log Behavior:**
    *   `rankInformationSources` ranks `query_law_on_insurance` highly.
    *   `DatabaseQueryExecutor.execute()` for "Law_on_Insurance" is called.
    *   Logs from `DatabaseQueryExecutor` indicating database query.
    *   `callFinalLLMSynthesis` is called with `query_law_on_insurance` as a source.
    *   Final AI response based on information from that law database.

### 6. Question: "Explain consumer rights regarding defective products under Cambodian law."
*   **Conversation:** Start a new conversation for this test.
*   **Expected Log Behavior:**
    *   `rankInformationSources` ranks `query_law_on_consumer_protection` highly.
    *   `DatabaseQueryExecutor.execute()` for "Law_on_Consumer_Protection" is called.
    *   `callFinalLLMSynthesis` with `query_law_on_consumer_protection` as source.

### 7. Question: "What are common exclusions in travel insurance policies in Cambodia?"
*   **Conversation:** Start a new conversation for this test.
*   **Expected Log Behavior:**
    *   `rankInformationSources` ranks `query_insurance_qna` highly.
    *   `DatabaseQueryExecutor.execute()` for "Insurance_and_reinsurance_in_Cambodia_QnA_format" is called.
    *   `callFinalLLMSynthesis` with `query_insurance_qna` as source.

### 8. Question: "Can you summarize the Elixer whitepaper?"
*   **Conversation:** Start a new conversation for this test.
*   **Expected Log Behavior:**
    *   `rankInformationSources` ranks `get_elixer_whitepaper` highly.
    *   `ElixerWhitepaperContentExecutor.execute()` is called.
    *   `callFinalLLMSynthesis` with `get_elixer_whitepaper` as source.

## III. Testing Tool Ranking & Potential Multiple Tool Scenarios

These are harder to guarantee specific outcomes for without knowing the exact ranking LLM's behavior, but we can try.

**Note:** This test case should be run in a **new, separate conversation**.

### 9. Question: "Compare the main points of the Law on Insurance and the Law on Consumer Protection regarding dispute resolution in Cambodia, and also check if there's any recent news on this topic."
*   **Conversation:** Start a new conversation for this test.
*   **Expected Log Behavior (Ideal):**
    *   `rankInformationSources` might rank `query_law_on_insurance`, `query_law_on_consumer_protection`, and `search_web` highly.
    *   Multiple tool executors might be called (sequentially or in parallel, depending on your `executeToolsByGroup` logic).
    *   `callFinalLLMSynthesis` is called with multiple sources.
*   **What to look for:** How the system handles multiple ranked tools. Does it execute them? In what order? How are their results combined?

## IV. Testing Agent Mode OFF (`DisableTools: true`)

For these, you'd need to run `getAIResponse` with the `DisableTools` flag set to `true` for the **entire duration of each new conversation**.

### 10. Question: "Tell me about insurance."
*   **Conversation:** Start a new conversation for this test (with `DisableTools: true`).
*   **(Run with `DisableTools: true`)**
*   **Expected Log Behavior:**
    *   `getAIResponse` log indicates `DisableTools: true`.
    *   `handleNoToolResponseFlow` is called.
    *   `AgentModeOffExecutor.execute()` is called.
    *   Log `[AgentModeOffExecutor] Executing direct response with agent mode off.`
    *   Log `[AgentModeOffExecutor] Generated response (...)`.
    *   The final AI response comes directly from `AgentModeOffExecutor`. No tool ranking or other executors involved.

### 11. Question: "Hello."
*   **Conversation:** Start a new conversation for this test (with `DisableTools: true`).
*   **(Run with `DisableTools: true`)**
*   **Expected Log Behavior:** Similar to Q10.

## V. Testing Conversation History

These tests specifically evaluate if context is maintained across multiple turns **within the same conversation**.

### 12. Test Case: Conversation Context
*   **Conversation:** The following two questions **must** be asked sequentially in the **same conversation**.
*   **First Question:** "What is the capital of France?"
    *   **Expected Log Behavior (First Q):** Likely `no_tool` direct response, or `search_web`.
*   **Second Question (in the same conversation):** "And what is its population?"
    *   **Expected Log Behavior (Second Q):**
        *   The conversation history (containing "What is the capital of France?" and its answer) should be passed to the relevant executor (`NoToolExecutor`, `WebSearchExecutor`, or `AgentModeOffExecutor` if agent mode is off).
        *   The executor should use this context to understand "its" refers to Paris.
        *   The final AI response should be the population of Paris.

## VI. Testing System Prompts (Indirectly)

If you have different system prompts (e.g., general vs. specialized), you'd run a generic question and see if the persona/tone/knowledge cutoff reflects the active system prompt. This is more qualitative.

**Note:** Each question variant (e.g., one with a general prompt, one with a specialized prompt) should be run in a **new, separate conversation** to isolate the system prompt's influence.

### 13. Test Case: System Prompt Influence
*   **Conversation:** Each question (e.g., "Who are you?" with general prompt, then "Who are you?" with specialized prompt) should be in a **new, separate conversation**.
*   **Question (with general system prompt):** "Who are you?"
*   **Question (with specialized system prompt, if any):** "Who are you?"
    *   **Expected Behavior:** The answer might differ based on the system prompt's instructions (e.g., persona, knowledge boundaries).

## How to Use This Test Suite:

1.  **Run each question** through your application.
2.  **Collect the logs** generated by Convex for that specific interaction.
3.  **Compare the actual logs** against the "Expected Log Behavior" outlined for each test case.
4.  **Note any discrepancies.** These could indicate a regression, a bug, or an unexpected change in LLM behavior.

This suite should provide good coverage of the core logic in `chatAI.ts` and `agentTools.ts`. Expand it over time as new features or tools are added.