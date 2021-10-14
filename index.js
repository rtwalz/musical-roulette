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
		roundAnswers: {}
	}

	res.json({code: newGameId})
})

app.get('/play', (req, res) => {
  res.render('play')
})

io.on('connection', (socket) => {

  socket.on('initial', (msg) => {
  	console.log(msg.gamecode, "gamecdoe", liveGameData)
    //msg: code, name, songs, id
    if (!liveGameData[msg.gamecode]) return socket.emit("error", "This game code doesn't exist. ")
    else if (liveGameData[msg.gamecode].inProgress) return socket.emit("error", "This game is already in-progress, so you can't join")
    socket.join(msg.gamecode)
	liveGameData[msg.gamecode].players.push({
		name: msg.name,
		songbank: msg.songs,
		socketId: socket.id,
		internalId: msg.id,
		points: 0,
		disconnected: false
	})
	io.to(msg.gamecode).emit('playerlist', liveGameData[msg.gamecode].players.map(x=>x.name))

  });

  socket.on('start', (msg)=> {
  	if (!liveGameData[msg]) return socket.emit("error", "this game code doesn't exist")
  	let allSongs = []
  	liveGameData[msg].players.forEach(function(player){
  		allSongs = allSongs.concat(player.songbank.map(obj=> ({ ...obj, owner: internalId })))
  	})
  	liveGameData[msg].songQuestions = shuffle(allSongs).slice(0,50)
  	liveGameData[msg].roundAnswers = {}
  	io.to(msg.gamecode).emit('question', {... liveGameData[msg].songQuestions[0], gameId: msg, seconds: 15})
  })

});

function shuffle(array) {
  let currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}

server.listen(3000, () => {
  console.log('listening on *:3000');
});