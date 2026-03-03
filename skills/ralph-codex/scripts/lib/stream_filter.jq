if .type == "item.completed" and (.item.type // "") == "agent_message" then
  (.item.text // "") + "\n\n"
else
  empty
end
