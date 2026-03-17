"use client";

import React, {
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";

interface MentionListProps {
  items: { id: string; name: string }[];
  command: (item: { id: string; label: string }) => void;
}

export interface MentionListHandle {
  onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean;
}

const MentionList = forwardRef<MentionListHandle, MentionListProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = props.items[index];
      if (item) {
        props.command({ id: item.id, label: item.name });
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex(
            (i) => (i + props.items.length - 1) % props.items.length
          );
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % props.items.length);
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden w-56">
        {props.items.length ? (
          props.items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectItem(i)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#F5EBE0] transition-colors ${
                i === selectedIndex ? "bg-[#F5EBE0]" : ""
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-[#C08B8B] text-white text-xs flex items-center justify-center font-medium flex-shrink-0">
                {item.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-[#1A1110] font-medium">{item.name}</span>
            </button>
          ))
        ) : (
          <div className="px-3 py-2 text-sm text-gray-400">Aucun résultat</div>
        )}
      </div>
    );
  }
);

MentionList.displayName = "MentionList";

export default MentionList;

