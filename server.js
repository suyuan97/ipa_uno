const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// Temporary hardcoded IPA deck
const exampleDeck = require("./public/ipa-deck.js"); // optional if you want to import it here

// In-memory game store
let games = {};

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function reshuffleDeck(game) {
  if (game.deck.length === 0 && game.discardPile.length > 0) {
    // Keep the current pile card, but add all other discarded cards back to deck
    const currentPileCard = game.pileCard;
    game.deck = [...game.discardPile];

    // Don't include the current pile card in the reshuffle
    if (currentPileCard) {
      const pileCardIndex = game.deck.findIndex(
        (card) =>
          card.symbol === currentPileCard.symbol &&
          (game.mode === "consonant"
            ? card.place === currentPileCard.place &&
              card.manner === currentPileCard.manner
            : card.height === currentPileCard.height &&
              card.backness === currentPileCard.backness)
      );
      if (pileCardIndex !== -1) {
        game.deck.splice(pileCardIndex, 1);
      }
    }

    shuffle(game.deck);
    game.discardPile = [];
    console.log(`Deck reshuffled! New deck size: ${game.deck.length}`);
  }
}

function createGame(roomId) {
  return {
    players: [],
    aiPlayers: [],
    hands: {},
    deck: [],
    pileCard: null,
    currentTurn: 0,
    started: false,
    mode: "consonant",
    difficulty: "easy",
    gameDirection: 1, // 1 for clockwise, -1 for counterclockwise
    lastPlayedCard: null,
    lastPlayerId: null,
    discardPile: [], // Track discarded cards to reshuffle when deck is empty
  };
}

function dealGame(game, playerIds, mode = "consonant") {
  const deck = require("./public/ipa-deck.js")[
    mode === "consonant" ? "consonantDeck" : "vowelDeck"
  ];
  game.deck = [...deck];
  shuffle(game.deck);

  // Deal to human player
  game.hands[playerIds[0]] = game.deck.splice(0, 7);

  // Reset AI players before dealing
  game.aiPlayers = [];

  // Deal to AI players
  for (let i = 1; i < 4; i++) {
    const aiId = `ai_${i}`;
    game.hands[aiId] = game.deck.splice(0, 7);
    game.aiPlayers.push(aiId);
  }

  // Ensure the first pile card is never a reverse or change card
  let pileCard = game.deck.pop();
  while (pileCard && (pileCard.isReverse || pileCard.isChange)) {
    game.deck.unshift(pileCard); // Put it back at the bottom
    shuffle(game.deck);
    pileCard = game.deck.pop();
  }
  game.pileCard = pileCard;
  game.discardPile = []; // Reset discard pile
  game.started = true;
  game.mode = mode;
  game.currentTurn = 0; // Human always starts
}

function isMatch(cardA, cardB, mode) {
  // Change cards can be played on any card, and any card can be played on a change card
  if (cardA.isChange || cardB.isChange) {
    return true;
  }
  // Reverse cards can be played on any card
  if (cardA.isReverse || cardB.isReverse) {
    return true;
  }
  if (mode === "consonant") {
    return cardA.place === cardB.place || cardA.manner === cardB.manner;
  } else {
    return cardA.height === cardB.height || cardA.backness === cardB.backness;
  }
}

function getPlayableCards(hand, pileCard, mode) {
  return hand.filter((card) => isMatch(card, pileCard, mode));
}

function aiMakeDecision(game, aiId) {
  const hand = game.hands[aiId];
  const playableCards = getPlayableCards(hand, game.pileCard, game.mode);

  if (aiId === "ai_3") {
    console.log(`AI 3 hand:`, JSON.stringify(hand));
    console.log(`AI 3 pileCard:`, JSON.stringify(game.pileCard));
    console.log(`AI 3 playableCards:`, JSON.stringify(playableCards));
  }

  console.log(
    `AI ${aiId} has ${hand.length} cards, ${playableCards.length} playable`
  );

  if (playableCards.length > 0) {
    // AI plays a card
    const randomIndex = Math.floor(Math.random() * playableCards.length);
    const cardToPlay = playableCards[randomIndex];

    // Find the actual card in the hand using the same index
    const cardIndex = hand.findIndex(
      (card) =>
        card.symbol === cardToPlay.symbol &&
        (game.mode === "consonant"
          ? card.place === cardToPlay.place && card.manner === cardToPlay.manner
          : card.height === cardToPlay.height &&
            card.backness === cardToPlay.backness)
    );

    if (cardIndex !== -1) {
      hand.splice(cardIndex, 1);

      // Add the old pile card to discard pile (if it exists)
      if (game.pileCard) {
        game.discardPile.push(game.pileCard);
      }

      game.pileCard = cardToPlay;
      game.lastPlayedCard = cardToPlay;
      game.lastPlayerId = aiId;

      // Handle reverse card effect
      if (cardToPlay.isReverse) {
        game.gameDirection *= -1; // Reverse the direction
        console.log(
          `Direction reversed! New direction: ${
            game.gameDirection === 1 ? "clockwise" : "counterclockwise"
          }`
        );
      }

      return {
        action: "play",
        card: cardToPlay,
        playerId: aiId,
      };
    } else {
      // If findIndex fails, log the issue for debugging
      if (aiId === "ai_3") {
        console.log(
          `AI 3 findIndex failed. cardToPlay:`,
          JSON.stringify(cardToPlay)
        );
        console.log(`AI 3 hand:`, JSON.stringify(hand));
      }
    }
  } else {
    // AI draws a card
    // Check if deck needs reshuffling
    reshuffleDeck(game);

    if (game.deck.length > 0) {
      const drawnCard = game.deck.pop();
      hand.push(drawnCard);

      return {
        action: "draw",
        card: drawnCard,
        playerId: aiId,
      };
    }
  }

  return null;
}

function nextTurn(game) {
  game.currentTurn = (game.currentTurn + game.gameDirection + 4) % 4;
}

io.on("connection", (socket) => {
  console.log("A player connected:", socket.id);

  socket.on("joinGame", (roomId, mode = "consonant", difficulty = "easy") => {
    if (!games[roomId]) {
      games[roomId] = createGame(roomId);
      games[roomId].mode = mode;
      games[roomId].difficulty = difficulty;
    }

    const game = games[roomId];

    // Only allow one human player
    if (game.players.length === 0) {
      game.players.push(socket.id);
      socket.join(roomId);

      console.log(`Player ${socket.id} joined room ${roomId}`);

      // Start game immediately with AI players
      dealGame(game, game.players, mode);

      // Send initial game state to human player
      io.to(socket.id).emit("startGame", {
        hand: game.hands[socket.id],
        pileCard: game.pileCard,
        playerId: socket.id,
        turn: game.currentTurn,
        mode: game.mode,
        difficulty: game.difficulty,
        aiPlayers: game.aiPlayers,
      });

      // Start AI turns if it's not the human player's turn
      if (game.currentTurn !== 0) {
        processAITurns(game, roomId);
      }
    } else {
      socket.emit("gameFull", { message: "Game is full" });
    }
  });

  socket.on("playCard", (data) => {
    const {
      roomId,
      cardIndex,
      changePlace,
      changeManner,
      changeHeight,
      changeBackness,
    } = data;
    const game = games[roomId];

    if (!game || game.currentTurn !== 0) {
      socket.emit("error", { message: "Not your turn" });
      return;
    }

    const hand = game.hands[socket.id];
    const card = hand[cardIndex];

    // Handle change card
    if (card.isChange) {
      // Remove the card from hand
      hand.splice(cardIndex, 1);
      // Add the old pile card to discard pile (if it exists)
      if (game.pileCard) {
        game.discardPile.push(game.pileCard);
      }
      // Set the new pile card with chosen articulation
      let newCard = { ...card };
      if (game.mode === "consonant") {
        newCard.place = changePlace;
        newCard.manner = changeManner;
      } else {
        newCard.height = changeHeight;
        newCard.backness = changeBackness;
      }
      game.pileCard = newCard;
      game.lastPlayedCard = newCard;
      game.lastPlayerId = socket.id;
      // Check for win
      if (hand.length === 0) {
        io.to(roomId).emit("gameOver", { winner: socket.id });
        return;
      }
      // Move to next turn
      nextTurn(game);
      // Update human player's hand
      io.to(socket.id).emit("updateHand", {
        hand: game.hands[socket.id],
      });
      // Broadcast the play
      io.to(roomId).emit("cardPlayed", {
        card: newCard,
        playerId: socket.id,
        turn: game.currentTurn,
        isChange: true,
      });
      // Process AI turns
      processAITurns(game, roomId);
      return;
    }

    if (isMatch(card, game.pileCard, game.mode)) {
      hand.splice(cardIndex, 1);

      // Add the old pile card to discard pile (if it exists)
      if (game.pileCard) {
        game.discardPile.push(game.pileCard);
      }

      game.pileCard = card;
      game.lastPlayedCard = card;
      game.lastPlayerId = socket.id;

      // Handle reverse card effect
      if (card.isReverse) {
        game.gameDirection *= -1; // Reverse the direction
        console.log(
          `Direction reversed! New direction: ${
            game.gameDirection === 1 ? "clockwise" : "counterclockwise"
          }`
        );
      }

      // Check for win
      if (hand.length === 0) {
        io.to(roomId).emit("gameOver", { winner: socket.id });
        return;
      }

      // Move to next turn
      nextTurn(game);

      // Update human player's hand
      io.to(socket.id).emit("updateHand", {
        hand: game.hands[socket.id],
      });

      // Broadcast the play
      io.to(roomId).emit("cardPlayed", {
        card: card,
        playerId: socket.id,
        turn: game.currentTurn,
        isReverse: card.isReverse,
      });

      // Process AI turns
      processAITurns(game, roomId);
    } else {
      socket.emit("error", { message: "Invalid play" });
    }
  });

  socket.on("drawCard", (data) => {
    const { roomId } = data;
    const game = games[roomId];

    if (!game || game.currentTurn !== 0) {
      console.log(
        `Draw attempt out of turn by ${socket.id} (currentTurn=${
          game ? game.currentTurn : "N/A"
        })`
      );
      socket.emit("error", { message: "Not your turn" });
      return;
    }

    // Check if deck needs reshuffling
    reshuffleDeck(game);

    if (game.deck.length > 0) {
      const drawnCard = game.deck.pop();
      game.hands[socket.id].push(drawnCard);

      // Move to next turn
      nextTurn(game);

      // Broadcast the draw
      io.to(roomId).emit("cardDrawn", {
        playerId: socket.id,
        turn: game.currentTurn,
      });

      // Update human player's hand
      io.to(socket.id).emit("updateHand", {
        hand: game.hands[socket.id],
      });

      // Process AI turns
      processAITurns(game, roomId);
    } else {
      socket.emit("error", { message: "Deck is empty" });
    }
  });

  socket.on("disconnect", () => {
    console.log("A player disconnected:", socket.id);
    // Clean up games when human player disconnects
    Object.keys(games).forEach((roomId) => {
      const game = games[roomId];
      if (game.players.includes(socket.id)) {
        delete games[roomId];
        console.log(`Game ${roomId} deleted due to player disconnect`);
      }
    });
  });
});

function processAITurns(game, roomId) {
  const processNextAITurn = () => {
    if (game.currentTurn === 0) {
      // Human player's turn, stop processing
      console.log("AI processing stopped - human player's turn");
      return;
    }

    const aiId = game.aiPlayers[game.currentTurn - 1];
    console.log(
      `Processing AI turn: ${aiId}, current turn: ${game.currentTurn}`
    );
    const decision = aiMakeDecision(game, aiId);
    if (aiId === "ai_3") {
      console.log(`AI 3 decision:`, JSON.stringify(decision));
    }

    if (decision) {
      // AI takes 2 seconds to play their card
      const totalDelay = 2000;

      // Check if AI will say something (30% chance)
      const aiNames = require("./public/ai-names.js").aiNameList;
      const aiIndex = parseInt(aiId.split("_")[1]) - 1;
      const aiName = aiNames[aiIndex] || "Wug";
      const wugKey = aiName.toLowerCase().replace(/\s+/g, "");

      let phrase = null;
      if (decision.action === "play") {
        try {
          // We'll evaluate the phrase function on the client side
          phrase = {
            wugKey: wugKey,
            card: decision.card,
            mode: game.mode,
          };
        } catch (error) {
          console.log("Error getting phrase:", error);
        }
      }

      // Show speech bubble at 2 second mark (if AI will speak)
      if (phrase) {
        setTimeout(() => {
          io.to(roomId).emit("aiThinking", {
            playerId: aiId,
            phrase: phrase,
          });
        }, 2000);
      }

      // Play the card at 4 second mark
      setTimeout(() => {
        if (decision.action === "play") {
          io.to(roomId).emit("cardPlayed", {
            card: decision.card,
            playerId: aiId,
            turn: game.currentTurn,
            phrase: phrase,
            isReverse: decision.card.isReverse,
          });

          // Check for AI win
          if (game.hands[aiId].length === 0) {
            io.to(roomId).emit("gameOver", { winner: aiId });
            return;
          }
        } else {
          io.to(roomId).emit("cardDrawn", {
            playerId: aiId,
            turn: game.currentTurn,
          });
        }

        // Move to next turn
        nextTurn(game);
        console.log(`Turn advanced to: ${game.currentTurn}`);

        // Process next AI turn if needed
        if (game.currentTurn !== 0) {
          processNextAITurn();
        } else {
          console.log("AI processing complete - human player's turn");
          // Notify human player that it's their turn
          io.to(roomId).emit("turnUpdate", {
            turn: game.currentTurn,
          });
        }
      }, 2000); // 2 second delay for AI to play their card
    } else {
      // AI can't make a decision (no playable cards and deck is empty)
      // Skip this AI's turn and move to next player
      console.log(`AI ${aiId} can't make a decision, skipping turn`);
      nextTurn(game);
      console.log(`Turn advanced to: ${game.currentTurn}`);

      // Process next AI turn if needed
      if (game.currentTurn !== 0) {
        processNextAITurn();
      } else {
        console.log("AI processing complete - human player's turn");
        // Notify human player that it's their turn
        io.to(roomId).emit("turnUpdate", {
          turn: game.currentTurn,
        });
      }
    }
  };

  processNextAITurn();
}

server.listen(PORT, () => {
  console.log(`IPA UNO server running at http://localhost:${PORT}`);
});
