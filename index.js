const express = require('express')
const app = express()
app.set("view engine", "pug")
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.render('index')
})

app.get('/play', (req, res) => {
  res.render('play')
})

app.listen(process.env.PORT || 3000, () => {
  console.log(`Example app listening at http://localhost`)
})