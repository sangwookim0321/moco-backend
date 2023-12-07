const dotenv = require('dotenv')
const express = require('express')
const cors = require('cors')
const app = express()

if (process.env.NODE_ENV === 'production') {
	dotenv.config({ path: './.env.production' })
} else {
	dotenv.config({ path: './.env.development' })
}

const PORT = process.env.PORT

app.use(express.json())
app.use(cors())

const adminRouter = require('./routes/admin/admin.js')
app.use('/admin', adminRouter)

app.listen(PORT, (req, res) => {
	console.log(`Server is running on port ${PORT}.`)
})
