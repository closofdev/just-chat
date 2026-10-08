import React, { useRef } from 'react';
import { useChat } from './hooks/useChat.js';
import { UserMessage } from './components/UserMessage.jsx';
import { AiMessage } from './components/AiMessage.jsx';
import { StreamMessage } from './components/StreamMessage.jsx';
import { ThinkingRow } from './components/ThinkingRow.jsx';
import { Composer } from './components/Composer.jsx';

export default function App() {
  const scrollRef = useRef(null);
  const chat = useChat(scrollRef);

  return (
    <main className="room-wrap">
      <div id="chatScroll" ref={scrollRef}>
        <div id="messages" aria-live="polite">
          {chat.messages.map((m, i) => (m.role === 'user'
            ? <UserMessage key={m.id} msg={m} />
            : (
              <AiMessage
                key={m.id} msg={m}
                onRegenerate={() => chat.regenerate(i)}
                onToggleLike={() => chat.toggleLike(m.id)}
              />
            )))}
          {chat.streamText ? <StreamMessage text={chat.streamText} /> : null}
        </div>
        {chat.thinking ? <ThinkingRow /> : null}
      </div>
      <Composer
        isStreaming={chat.isStreaming} onSend={chat.send} onStop={chat.stop}
        model={chat.model} models={chat.models} onModelChange={chat.setModel}
      />
    </main>
  );
}
