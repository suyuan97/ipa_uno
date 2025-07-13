# IPA UNO - Multiplayer AI Game

**IPA UNO** is an educational, UNO-inspired card game where you play against AI opponents to learn the International Phonetic Alphabet (IPA). Match cards by phonetic features, use special action cards, and race to empty your hand first. The game is played in your browser with a Node.js backend and real-time updates.

## Game Summary

- **Players:** 1 human vs 3 AI
- **Goal:** Be the first to play all your cards
- **Gameplay:** Match cards by phonetic properties (consonant/vowel features) or play special action cards
- **Special Cards:** +2, +4, Skip, Reverse, Change (wild)
- **Educational:** Reinforces IPA knowledge through play

## Features

- **1 Human Player vs 3 AI Opponents**: Play against intelligent AI players
- **Two Game Modes**:
  - Consonant deck (matching by place/manner of articulation)
  - Vowel deck (matching by height/backness)
- **Two Difficulty Levels**:
  - Easy: Cards show phonetic labels
  - Hard: Cards show only IPA symbols
- **Real-time Gameplay**: Live turn-based gameplay with visual feedback
- **Educational**: Learn phonetic properties while having fun

## How to Play

1. **Start the server**:

   ```bash
   npm start
   ```

2. **Open your browser** and go to `http://localhost:3000`

3. **Choose your game settings**:

   - Select Consonant or Vowel mode
   - Choose Easy (labeled) or Hard (symbols only) difficulty

4. **Play the game**:
   - Match cards by phonetic properties
   - Consonants: Match by place of articulation OR manner of articulation
   - Vowels: Match by height OR backness
   - Play special action cards to change the flow
   - Draw cards when you can't play
   - First player to empty their hand wins!

## Game Rules

### Card Matching

- **Consonants**: Cards match if they share the same place of articulation (bilabial, alveolar, etc.) OR the same manner of articulation (plosive, fricative, etc.)
- **Vowels**: Cards match if they share the same height (close, open-mid, etc.) OR the same backness (front, central, back)

### Special Action Cards

- **+2 Card**: Next player must draw 2 cards and skip their turn. If another +2 is played in response, the penalty stacks.
- **+4 Card**: Next player must draw 4 cards and skip their turn. Stacks with other +2/+4 cards.
- **Skip Card**: Next player loses their turn.
- **Reverse Card**: Reverses the direction of play (with 2 players, acts as a skip).
- **Change Card (Wild)**: Can be played on any card; lets you choose the next feature to match.

### Turn Order

- Human player always goes first
- AI players take turns automatically
- 1-second delay between AI moves for visibility
- After a +2 or +4, the affected player draws the required cards and their turn is skipped (recently fixed for both AI and human players)

### Winning

- First player (human or AI) to play all their cards wins
- Game automatically ends and shows the winner

## Technical Details

- **Backend**: Node.js with Express and Socket.IO
- **Frontend**: HTML/CSS/JavaScript
- **AI Logic**: Simple rule-based AI that plays valid moves
- **Real-time Communication**: WebSocket connections for live updates

## AI Behavior

The AI players use a simple strategy:

1. Look for playable cards in their hand
2. Play a random valid card if available
3. Draw a card if no playable cards exist
4. Continue until they can play or the deck is empty
5. If forced to draw by +2/+4, they draw and skip their turn (recently fixed)

## Future Enhancements

- Integration with actual LLM systems for more intelligent AI
- Multiple AI difficulty levels
- Special action cards (skip, reverse, etc.)
- Statistics and learning progress tracking
- Sound effects and animations

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the server:

   ```bash
   npm start
   ```

3. Open `http://localhost:3000` in your browser

4. Enjoy learning IPA through gameplay!
