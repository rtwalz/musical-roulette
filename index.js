const express = require('express')
const app = express()
const http = require('http');
const server = http.createServer(app);

app.set("view engine", "pug")
app.use(express.static('public'))
const { Server } = require("socket.io");
const io = new Server(server);
const shortid = require('shortid');

let liveGameData = {

}

app.get('/', (req, res) => {
  res.render('index')
})

app.get("/newgame", (req,res)=>{
	let newGameId = Math.floor(100000 + Math.random() * 900000).toString()

	liveGameData[newGameId] = {
		date: (new Date).toISOString(),
		players: [],
		songQuestions: [],
		inProgress: false,
		currentRound: 0,
		roundAnswers: {},
		scores: {}
	}

	res.json({code: newGameId})
})

app.get('/play', (req, res) => {
  res.render('play')
})

io.on('connection', (socket) => {

  socket.on('initial', (msg) => {
  	console.log(msg.gamecode, "gamecdoe", liveGameData)
    //msg: gamecode, name, songs, id
    if (!liveGameData[msg.gamecode]) return socket.emit("error", "This game code doesn't exist. ")
    else if (liveGameData[msg.gamecode].inProgress) return socket.emit("error", "This game is already in-progress, so you can't join")
    socket.join(msg.gamecode)
	liveGameData[msg.gamecode].players.push({
		name: msg.name,
		songbank: msg.songs,
		socketId: socket.id,
		internalId: msg.id,
		disconnected: false
	})
	io.to(msg.gamecode).emit('playerlist', liveGameData[msg.gamecode].players.map(x=>x.name))

  });

  socket.on("answer", (msg) => {
  	// msg: gamecode, id, pick (pick is id of the person they think it is), correct (boolean, whether it's right), ms (milliseconds guessed in)
  	if (!liveGameData[msg.gamecode]) return socket.emit("error", "This game code doesn't exist. ")
  	liveGameData[msg.gamecode].roundAnswers[msg.id] = msg.pick
  console.log(msg.correct, "msgcorrect")
  if (!liveGameData[msg.gamecode].scores[msg.id]) liveGameData[msg.gamecode].scores[msg.id] = 0
  	if (msg.correct) liveGameData[msg.gamecode].scores[msg.id] += 500+ (15000-msg.ms)*0.0357
  		console.log(liveGameData[msg.gamecode].scores, "scores!!!")

  })
//todo scores won't get added because probably msg.correct isn't sending properly
  function sendQuestion(gameId){
  	liveGameData[gameId].roundAnswers = {}
  	let selectedQ = liveGameData[gameId].songQuestions.shift()
  	io.to(gameId).emit('question', {... selectedQ, room: gameId, gameId, ownerName: selectedQ.ownerName, ownerIndex: selectedQ.index, players: liveGameData[gameId].players, ms: 14500})
  	setTimeout(function(){
  		// {scores: [{name: Riley, score: 5000, correct: false, pick: Cade} ... ]}
  		let scoreReturn = {question: selectedQ, scores: [], round: liveGameData[gameId].totalRoundCount - liveGameData[gameId].songQuestions.length, totalRounds: liveGameData[gameId].totalRoundCount}
  		liveGameData[gameId].players.forEach(function(player){

  			scoreReturn.scores.push({
  				name: player.name,
  				pick: liveGameData[gameId].players.find(element => element.internalId == liveGameData[gameId].roundAnswers[player.internalId])?.name || "Too slow",
  				score: liveGameData[gameId].scores[player.internalId] || 0,
  				correct: selectedQ.owner == liveGameData[gameId].roundAnswers[player.internalId]
  			})

  			scoreReturn.scores.sort(function(a, b) {
			    return b.score - a.score;
			});
  		})
  		io.to(gameId).emit('result', scoreReturn)
  		setTimeout(function(){
  			if (liveGameData[gameId].songQuestions.length){
  				sendQuestion(gameId)
  			} else {
          io.to(gameId).emit("finish")
        }
  		}, 14000)
  	}, 15000)
  }

  socket.on('start', (msg)=> {
  	if (!liveGameData[msg]) return socket.emit("error", "this game code doesn't exist")
  	if (liveGameData[msg].inProgress) return // game already in progress
  	liveGameData[msg].inProgress = true
  	let allSongs = []
  	liveGameData[msg].players.forEach(function(player){
  		allSongs = allSongs.concat(player.songbank.map(obj=> ({ ...obj, owner: player.internalId, ownerName: player.name })))
  	})

    let allSongObjects = {}
    allSongs.forEach(function(song){
      if (!allSongObjects[song.id]) allSongObjects[song.id] = [song]
      else allSongObjects[song.id].push(song)
    })

    allSongs = []
    Object.values(allSongObjects).forEach(function(songArrays){
      if (songArrays.length == 1) allSongs.push(songArrays[0])
      else {
        songArrays.sort((a, b) => a.index - b.index);
        songArrays[0].otherIndexes = []
        songArrays.forEach(function(songg, indeo){
          if (indeo !== 0){
            songArrays[0].otherIndexes.push([songg.index, songg.ownerName])
          }
        })
        allSongs.push(songArrays[0])
      }
    })


  	liveGameData[msg].songQuestions = shuffle(allSongs).slice(0,20)
  	liveGameData[msg].roundAnswers = {}
  	liveGameData[msg].totalRoundCount = liveGameData[msg].songQuestions.length
  	sendQuestion(msg)
  })

});

function shuffle(array) {
  return array.map(value => ({ value, sort: Math.random() }))
  .sort((a, b) => a.sort - b.sort)
  .map(({ value }) => value)
}


server.listen(process.env.PORT || 3000., () => {
  console.log('listening on *:3000');
});