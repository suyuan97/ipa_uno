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
    plusTwoCount: 0, // Track accumulated +2 cards
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

  // Ensure the first pile card is never a reverse, change, +2, or +4 card
  let pileCard = game.deck.pop();
  while (
    pileCard &&
    (pileCard.isReverse ||
      pileCard.isChange ||
      pileCard.isPlusTwo ||
      pileCard.isPlusFour ||
      pileCard.isSkip)
  ) {
    game.deck.unshift(pileCard); // Put it back at the bottom
    shuffle(game.deck);
    pileCard = game.deck.pop();
  }
  game.pileCard = pileCard;
  game.discardPile = []; // Reset discard pile
  game.started = true;
  game.mode = mode;
  game.currentTurn = 0; // Human always starts
  return game;
}

function isMatch(cardA, cardB, mode) {
  // Functional cards can always be played on a change card, and vice versa
  if (
    (cardA.isChange &&
      (cardB.isPlusTwo ||
        cardB.isPlusFour ||
        cardB.isReverse ||
        cardB.isSkip)) ||
    (cardB.isChange &&
      (cardA.isPlusTwo || cardA.isPlusFour || cardA.isReverse || cardA.isSkip))
  ) {
    return true;
  }
  // Skip cards can be played on any card, and any card can be played on a skip card
  if (cardA.isSkip || cardB.isSkip) {
    return true;
  }
  // Change cards can be played on any card, and any card can be played on a change card
  if (cardA.isChange || cardB.isChange) {
    // Only match on the property that is not 'change' for the change card
    if (mode === "consonant") {
      if (cardA.isChange) {
        if (cardA.place !== "change") return cardB.place === cardA.place;
        if (cardA.manner !== "change") return cardB.manner === cardA.manner;
        return true;
      } else if (cardB.isChange) {
        if (cardB.place !== "change") return cardA.place === cardB.place;
        if (cardB.manner !== "change") return cardA.manner === cardB.manner;
        return true;
      }
    } else {
      if (cardA.isChange) {
        if (cardA.height !== "change") return cardB.height === cardA.height;
        if (cardA.backness !== "change")
          return cardB.backness === cardA.backness;
        return true;
      } else if (cardB.isChange) {
        if (cardB.height !== "change") return cardA.height === cardB.height;
        if (cardB.backness !== "change")
          return cardA.backness === cardB.backness;
        return true;
      }
    }
    return true;
  }
  // +4 cards can be played on any card, and any card can be played on a +4 card
  if (cardA.isPlusFour || cardB.isPlusFour) {
    return true;
  }
  // +2 cards can be played on any card, and any card can be played on a +2 card
  if (cardA.isPlusTwo || cardB.isPlusTwo) {
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
    let cardToPlay = playableCards[randomIndex];

    // Find the actual card in the hand first (before modifying it)
    const cardIndex = hand.findIndex(
      (card) =>
        card.symbol === cardToPlay.symbol &&
        (game.mode === "consonant"
          ? card.place === cardToPlay.place && card.manner === cardToPlay.manner
          : card.height === cardToPlay.height &&
            card.backness === cardToPlay.backness)
    );

    if (cardIndex !== -1) {
      // Remove the card from hand first
      hand.splice(cardIndex, 1);

      // If it's a change card, set only one property after removing from hand
      if (cardToPlay.isChange) {
        cardToPlay = { ...cardToPlay };
        if (game.mode === "consonant") {
          if (Math.random() < 0.5) {
            const places = [
              "bilabial",
              "labiodental",
              "dental",
              "alveolar",
              "postalveolar",
              "retroflex",
              "palatal",
              "velar",
              "uvular",
              "pharyngeal",
              "glottal",
            ];
            cardToPlay.place =
              places[Math.floor(Math.random() * places.length)];
            cardToPlay.manner = "change";
          } else {
            const manners = [
              "plosive",
              "nasal",
              "trill",
              "tap",
              "fricative",
              "affricate",
              "approximant",
              "lateral approximant",
            ];
            cardToPlay.manner =
              manners[Math.floor(Math.random() * manners.length)];
            cardToPlay.place = "change";
          }
        } else {
          if (Math.random() < 0.5) {
            const heights = [
              "close",
              "near-close",
              "close-mid",
              "mid",
              "open-mid",
              "near-open",
              "open",
            ];
            cardToPlay.height =
              heights[Math.floor(Math.random() * heights.length)];
            cardToPlay.backness = "change";
          } else {
            const backnesses = ["front", "central", "back"];
            cardToPlay.backness =
              backnesses[Math.floor(Math.random() * backnesses.length)];
            cardToPlay.height = "change";
          }
        }
      }

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

      // Note: +2/+4 effects are handled when the card is actually played, not when the decision is made

      // Handle skip card effect
      if (cardToPlay.isSkip) {
        nextTurn(game); // Skip the next player
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
      // Handle +2 effect
      let cardsToDraw = 1;
      let isPlusTwoDraw = false;

      if (game.plusTwoCount > 0) {
        cardsToDraw = game.plusTwoCount;
        isPlusTwoDraw = true;
        game.plusTwoCount = 0; // Reset the count
        console.log(`AI ${aiId} drawing ${cardsToDraw} cards due to +2 effect`);
      }

      // Draw the required number of cards
      for (let i = 0; i < cardsToDraw && game.deck.length > 0; i++) {
        const drawnCard = game.deck.pop();
        hand.push(drawnCard);
      }

      return {
        action: "draw",
        card: null, // Multiple cards drawn, no single card to return
        playerId: aiId,
        isPlusTwo: isPlusTwoDraw,
        cardsDrawn: cardsToDraw,
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

  socket.on("joinGame", (roomId, mode, difficulty) => {
    // If the room exists and the player is already in the room, treat this as a request to restart the game
    if (games[roomId] && games[roomId].players[0] === socket.id) {
      // Reset the game state for the room
      dealGame(games[roomId], games[roomId].players, mode);
      // Re-join the socket to the room (in case it was disconnected)
      socket.join(roomId);
      // Notify the client that the game has started
      io.to(roomId).emit("gameStarted", {
        hand: games[roomId].hands[socket.id],
        pileCard: games[roomId].pileCard,
        playerId: socket.id,
        turn: games[roomId].currentTurn,
        mode: games[roomId].mode,
        difficulty: games[roomId].difficulty,
        aiPlayers: games[roomId].aiPlayers,
      });
      // Start the AI turns if needed
      setTimeout(() => processAITurns(games[roomId], roomId), 1000);
      return;
    }

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
      // Set the new pile card with only the chosen articulation property
      let newCard = { ...card };
      if (game.mode === "consonant") {
        newCard.place = data.changePlace || "change";
        newCard.manner = data.changeManner || "change";
      } else {
        newCard.height = data.changeHeight || "change";
        newCard.backness = data.changeBackness || "change";
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

      // Handle +2 card effect
      if (card.isPlusTwo) {
        if (game.plusTwoCount > 0) {
          game.plusTwoCount += 2;
        } else {
          game.plusTwoCount = 2;
        }
        console.log(`+2 card played! Total to draw: ${game.plusTwoCount}`);
      }

      // Handle +4 card effect
      if (card.isPlusFour) {
        if (game.plusTwoCount > 0) {
          game.plusTwoCount += 4;
        } else {
          game.plusTwoCount = 4;
        }
        console.log(`+4 card played! Total to draw: ${game.plusTwoCount}`);
      }

      // Handle skip card effect
      if (card.isSkip) {
        nextTurn(game); // Skip the next player
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
        isPlusTwo: card.isPlusTwo,
        isPlusFour: card.isPlusFour,
        isSkip: card.isSkip,
      });

      // Process AI turns
      processAITurns(game, roomId);
    } else {
      socket.emit("error", { message: "Invalid play" });
    }
  });

  // Handle human player starting their turn with plusTwoCount > 0
  socket.on("startTurn", (data) => {
    const { roomId } = data;
    const game = games[roomId];

    console.log(
      `startTurn event received for room ${roomId}, currentTurn: ${game?.currentTurn}, plusTwoCount: ${game?.plusTwoCount}`
    );

    if (!game || game.currentTurn !== 0) {
      console.log("startTurn: Not human player's turn or no game");
      return;
    }

    // Check if human player needs to draw due to +2/+4
    if (game.plusTwoCount > 0) {
      console.log(
        `startTurn: Human player needs to draw ${game.plusTwoCount} cards`
      );
      const playerId = socket.id;
      let cardsToDraw = game.plusTwoCount;
      // Determine if the draw is due to a +4 (or stacked +4)
      const isPlusFourDraw =
        !!game.lastPlayedCard && game.lastPlayedCard.isPlusFour;
      game.plusTwoCount = 0;

      // Draw the cards
      for (let i = 0; i < cardsToDraw && game.deck.length > 0; i++) {
        const drawnCard = game.deck.pop();
        game.hands[playerId].push(drawnCard);
      }

      console.log(`startTurn: Human player drew ${cardsToDraw} cards`);

      // Emit card drawn event
      io.to(roomId).emit("cardDrawn", {
        playerId: playerId,
        turn: game.currentTurn,
        isPlusTwo: !isPlusFourDraw,
        isPlusFour: isPlusFourDraw,
        cardsDrawn: cardsToDraw,
      });

      // Update human player's hand
      io.to(playerId).emit("updateHand", {
        hand: game.hands[playerId],
      });

      // Skip human player's turn after drawing
      nextTurn(game);
      io.to(roomId).emit("turnUpdate", {
        turn: game.currentTurn,
      });

      // Process AI turns
      processAITurns(game, roomId);
    } else {
      console.log("startTurn: Human player doesn't need to draw");
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
      // Handle +2 effect
      let cardsToDraw = 1;
      let isPlusTwoDraw = false;

      if (game.plusTwoCount > 0) {
        cardsToDraw = game.plusTwoCount;
        isPlusTwoDraw = true;
        game.plusTwoCount = 0; // Reset the count
        console.log(`Player drawing ${cardsToDraw} cards due to +2 effect`);
      }

      // Draw the required number of cards
      for (let i = 0; i < cardsToDraw && game.deck.length > 0; i++) {
        const drawnCard = game.deck.pop();
        game.hands[socket.id].push(drawnCard);
      }

      // Move to next turn
      nextTurn(game);

      // Broadcast the draw
      io.to(roomId).emit("cardDrawn", {
        playerId: socket.id,
        turn: game.currentTurn,
        isPlusTwo: isPlusTwoDraw,
        cardsDrawn: cardsToDraw,
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
      // Human player's turn
      console.log(
        `processAITurns: Human player's turn, plusTwoCount: ${game.plusTwoCount}`
      );
      if (game.plusTwoCount > 0) {
        const playerId = game.players[0];
        let cardsToDraw = game.plusTwoCount;
        // Determine if the draw is due to a +4 (or stacked +4)
        const isPlusFourDraw =
          !!game.lastPlayedCard && game.lastPlayedCard.isPlusFour;
        game.plusTwoCount = 0;
        for (let i = 0; i < cardsToDraw && game.deck.length > 0; i++) {
          const drawnCard = game.deck.pop();
          game.hands[playerId].push(drawnCard);
        }
        io.to(roomId).emit("cardDrawn", {
          playerId: playerId,
          turn: game.currentTurn,
          isPlusTwo: !isPlusFourDraw,
          isPlusFour: isPlusFourDraw,
          cardsDrawn: cardsToDraw,
        });
        io.to(playerId).emit("updateHand", {
          hand: game.hands[playerId],
        });
        nextTurn(game);
        io.to(roomId).emit("turnUpdate", {
          turn: game.currentTurn,
        });
        // After skipping, check again if the next player is human and plusTwoCount > 0
        if (game.currentTurn === 0 && game.plusTwoCount > 0) {
          processNextAITurn();
        } else if (game.currentTurn !== 0) {
          processNextAITurn();
        }
        return;
      } else {
        console.log("AI processing stopped - human player's turn");
        return;
      }
    }
    // AI player's turn
    const aiId = game.aiPlayers[game.currentTurn - 1];
    if (game.plusTwoCount > 0) {
      console.log(`[DEBUG] AI ${aiId} turn: plusTwoCount=${game.plusTwoCount}`);
      let cardsToDraw = game.plusTwoCount;
      // Determine if the draw is due to a +4 (or stacked +4)
      const isPlusFourDraw =
        !!game.lastPlayedCard && game.lastPlayedCard.isPlusFour;
      game.plusTwoCount = 0;
      // NEW: If AI, show speech bubble first, then draw after delay
      if (game.currentTurn !== 0) {
        // AI's turn
        const aiNames = require("./public/ai-names.js").aiNameList;
        const aiIndex =
          parseInt(game.aiPlayers[game.currentTurn - 1].split("_")[1]) - 1;
        const aiName = aiNames[aiIndex] || "Wug";
        const wugKey = aiName.toLowerCase().replace(/\s+/g, "");
        // Build phrase object for plusTwo/plusFour
        let drawPhrase = {
          wugKey: wugKey,
          card: {
            isPlusTwo: !isPlusFourDraw,
            isPlusFour: isPlusFourDraw,
          },
          mode: game.mode,
        };
        // Emit aiThinking (speech bubble) first
        io.to(roomId).emit("aiThinking", {
          playerId: game.aiPlayers[game.currentTurn - 1],
          phrase: drawPhrase,
        });
        // After 1s, draw the cards and emit cardDrawn
        setTimeout(() => {
          console.log(
            `[DEBUG] AI ${aiId} drawing ${cardsToDraw} cards due to +2/+4`
          );
          for (let i = 0; i < cardsToDraw && game.deck.length > 0; i++) {
            const drawnCard = game.deck.pop();
            game.hands[game.aiPlayers[game.currentTurn - 1]].push(drawnCard);
          }
          io.to(roomId).emit("cardDrawn", {
            playerId: game.aiPlayers[game.currentTurn - 1],
            turn: game.currentTurn,
            isPlusTwo: !isPlusFourDraw,
            isPlusFour: isPlusFourDraw,
            cardsDrawn: cardsToDraw,
          });
          // Skip this AI's turn after drawing +2/+4 cards
          nextTurn(game);
          io.to(roomId).emit("turnUpdate", {
            turn: game.currentTurn,
          });
          // After drawing +2/+4 cards, continue processing turns
          processNextAITurn();
          return;
        }, 1000);
        return;
      }
    }
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
        }, 4000); // 4 seconds
      }

      // Play the card at 2 second mark
      setTimeout(() => {
        if (decision.action === "play") {
          // Update the pile card and hand
          game.pileCard = decision.card;
          game.lastPlayedCard = decision.card;
          game.lastPlayerId = aiId;

          // Handle +2 card effect
          if (decision.card.isPlusTwo) {
            if (game.plusTwoCount > 0) {
              game.plusTwoCount += 2;
            } else {
              game.plusTwoCount = 2;
            }
            console.log(
              `AI played +2 card! Total to draw: ${game.plusTwoCount}`
            );
            console.log(
              `[DEBUG] New pile card:`,
              JSON.stringify(game.pileCard)
            );
            // Advance turn and process next turn immediately
            nextTurn(game);
            io.to(roomId).emit("cardPlayed", {
              card: decision.card,
              playerId: aiId,
              turn: game.currentTurn,
              phrase: phrase,
              isReverse: decision.card.isReverse,
              isPlusTwo: decision.card.isPlusTwo,
              isPlusFour: decision.card.isPlusFour,
            });
            io.to(roomId).emit("turnUpdate", { turn: game.currentTurn });
            processNextAITurn();
            return;
          }

          // Handle +4 card effect
          if (decision.card.isPlusFour) {
            if (game.plusTwoCount > 0) {
              game.plusTwoCount += 4;
            } else {
              game.plusTwoCount = 4;
            }
            console.log(
              `AI played +4 card! Total to draw: ${game.plusTwoCount}`
            );
            console.log(
              `[DEBUG] New pile card:`,
              JSON.stringify(game.pileCard)
            );
            // Advance turn and process next turn immediately
            nextTurn(game);
            io.to(roomId).emit("cardPlayed", {
              card: decision.card,
              playerId: aiId,
              turn: game.currentTurn,
              phrase: phrase,
              isReverse: decision.card.isReverse,
              isPlusTwo: decision.card.isPlusTwo,
              isPlusFour: decision.card.isPlusFour,
            });
            io.to(roomId).emit("turnUpdate", { turn: game.currentTurn });
            processNextAITurn();
            return;
          }

          // For all other cards, update the pile and log
          console.log(`[DEBUG] New pile card:`, JSON.stringify(game.pileCard));
          io.to(roomId).emit("cardPlayed", {
            card: decision.card,
            playerId: aiId,
            turn: game.currentTurn,
            phrase: phrase,
            isReverse: decision.card.isReverse,
            isPlusTwo: decision.card.isPlusTwo,
            isPlusFour: decision.card.isPlusFour,
          });

          // Check for AI win
          if (game.hands[aiId].length === 0) {
            io.to(roomId).emit("gameOver", { winner: aiId });
            return;
          }

          // If +2 or +4, just return - the plusTwoCount is now set correctly
          if (decision.card.isPlusTwo || decision.card.isPlusFour) {
            return; // Exit early to prevent main AI play logic from executing
          }
        } else {
          io.to(roomId).emit("cardDrawn", {
            playerId: aiId,
            turn: game.currentTurn,
            isPlusTwo: decision.isPlusTwo,
            cardsDrawn: decision.cardsDrawn,
          });
        }

        // Move to next turn (only if no +2/+4 was played)
        nextTurn(game);
        console.log(`Turn advanced to: ${game.currentTurn}`);

        // Process next AI turn if needed
        io.to(roomId).emit("turnUpdate", {
          turn: game.currentTurn,
        });
        // After skipping, check again if the next player is human and plusTwoCount > 0
        if (game.currentTurn === 0 && game.plusTwoCount > 0) {
          processNextAITurn();
        } else if (game.currentTurn !== 0) {
          processNextAITurn();
        } else {
          console.log("AI processing complete - human player's turn");
          // Notify human player that it's their turn
          // (already done above)
        }
      }, 4000); // 4 second delay for AI to play their card
    } else {
      // AI can't make a decision (no playable cards and deck is empty)
      // Skip this AI's turn and move to next player
      console.log(`AI ${aiId} can't make a decision, skipping turn`);
      nextTurn(game);
      console.log(`Turn advanced to: ${game.currentTurn}`);

      // Process next AI turn if needed
      io.to(roomId).emit("turnUpdate", {
        turn: game.currentTurn,
      });
      // After skipping, check again if the next player is human and plusTwoCount > 0
      if (game.currentTurn === 0 && game.plusTwoCount > 0) {
        processNextAITurn();
      } else if (game.currentTurn !== 0) {
        processNextAITurn();
      } else {
        console.log("AI processing complete - human player's turn");
        // Notify human player that it's their turn
        // (already done above)
      }
    }
  };

  processNextAITurn();
}

server.listen(PORT, () => {
  console.log(`IPA UNO server running at http://localhost:${PORT}`);
});
