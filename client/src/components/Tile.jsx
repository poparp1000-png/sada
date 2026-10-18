import { useEffect, useRef } from 'react';
import Avatar, { colorFor } from './Avatar.jsx';
import Icon from './Icon.jsx';

export default function Tile({ person, stream, self, speaking, hand, big, micOff, camOff, caption }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream ?? null; }, [stream]);
  return (
    <div className={`tile ${big ? 'big' : ''} ${speaking ? 'speaking' : ''}`} style={{ '--c': colorFor(person.name) }}>
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={self} className={self ? 'mirror' : ''} />
      ) : (
        <Avatar name={person.name} size={big ? 120 : 76} className="tile-avatar" />
      )}
      {hand && <span className="tile-hand">✋</span>}
      <span className="tile-name">
        {speaking && <i className="eq" aria-hidden="true"><b /><b /><b /></i>}
        {micOff && <Icon name="micOff" size={14} />}
        {camOff && !stream && <Icon name="videoOff" size={14} />}
        {self ? 'أنت' : person.name}
      </span>
      {caption && <span className="tile-caption">{caption}</span>}
    </div>
  );
}
