#!/bin/bash

FILE="charts/scout/latest_action_simple.txt"
LAST_CONTENT=""

echo "Monitoring $FILE for changes..."

while true; do
  if [ -f "$FILE" ]; then
    CURRENT_CONTENT=$(cat "$FILE" 2>/dev/null)
    
    if [ "$CURRENT_CONTENT" != "$LAST_CONTENT" ] && [ -n "$LAST_CONTENT" ]; then
      echo "$(date): Decision changed: $LAST_CONTENT → $CURRENT_CONTENT"
      
      if [ "$CURRENT_CONTENT" != "DO NOTHING" ]; then
        # 🚨 TRADE SIGNAL - MAXIMUM PROMINENCE 🚨
        echo ""
        echo "🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨"
        echo "🚨🚨🚨   TRADE SIGNAL: $CURRENT_CONTENT   🚨🚨🚨"
        echo "🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨"
        echo ""
        
        # Multiple loud notifications with different sounds
        osascript -e "display notification \"🚨 TRADE SIGNAL: $CURRENT_CONTENT 🚨\" with title \"AlphaGroove Scout\" sound name \"Glass\""
        sleep 0.5
        osascript -e "display notification \"🔥 ACTION REQUIRED: $CURRENT_CONTENT 🔥\" with title \"AlphaGroove Alert\" sound name \"Basso\""
        sleep 0.5
        osascript -e "display notification \"📈 EXECUTE TRADE: $CURRENT_CONTENT 📈\" with title \"AlphaGroove Signal\" sound name \"Ping\""
        
        # Terminal bells
        echo -e "\a\a\a\a\a"
        sleep 0.2
        echo -e "\a\a\a\a\a"
        
      else
        # DO NOTHING - Still noticeable but less aggressive
        echo "💤 Signal: $CURRENT_CONTENT"
        osascript -e "display notification \"Signal: $CURRENT_CONTENT\" with title \"AlphaGroove Scout\" sound name \"Blow\""
        echo -e "\a"
      fi
    fi
    
    LAST_CONTENT="$CURRENT_CONTENT"
  fi
  
  sleep 5  # Check every 5 seconds
done
