import React from 'react';
import { timeStr } from '../lib/time.js';

export function UserMessage({ msg }) {
  return (
    <div className="msg-user">
      <div className="msg-user-inner">
        <div className="user-bubble">{msg.content}</div>
        <div className="msg-time">{timeStr(msg.time)}</div>
      </div>
    </div>
  );
}
