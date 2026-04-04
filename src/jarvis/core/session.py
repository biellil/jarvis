"""Conversational session — streaming chat loop with message history.

Per CONV-01: ChatSession manages the conversation history and streams
tokens to stdout using plain print() (not Rich) per D-02.

The session maintains a full message history starting with a SystemMessage
so the LLM always has context about who JARVIS is.
"""

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
from langchain_core.language_models.chat_models import BaseChatModel


SYSTEM_PROMPT = (
"Você é JARVIS, um assistente pessoal prestativo."
"Você se lembra de tudo das nossas conversas e ajuda o usuário"
"com tarefas, perguntas e tudo o que ele precisar."
)


class ChatSession:
    """Manages a streaming conversation session with message history.

    Maintains the full conversation history as a list of LangChain messages.
    Each call to send() appends the user's HumanMessage, streams the LLM
    response token by token, then appends the full AIMessage.

    Per D-02: Token output uses plain print(token, end='', flush=True).
    Rich is NOT used for the streamed output — only for the prompt/label.
    """

    def __init__(self, llm: BaseChatModel) -> None:
        self.llm = llm
        self.history: list[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]

    async def send(self, user_input: str) -> str:
        """Send a message and stream the LLM response.

        Appends HumanMessage to history, streams response tokens via
        plain print(), then appends the complete AIMessage to history.

        Args:
            user_input: The user's message text.

        Returns:
            The complete response string.
        """
        self.history.append(HumanMessage(content=user_input))
        full_response = ""
        async for chunk in self.llm.astream(self.history):
            token = chunk.content
            if token:
                print(token, end="", flush=True)  # per D-02: plain print, no Rich
                full_response += token
        print()  # newline after stream ends
        self.history.append(AIMessage(content=full_response))
        return full_response
