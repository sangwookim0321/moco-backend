const dotenv = require('dotenv')
const express = require('express')
const cors = require('cors')
const app = express()

if (process.env.NODE_ENV === 'production') {
	dotenv.config({ path: './.env.production' })
} else {
	dotenv.config({ path: './.env.development' })
}

const PORT = process.env.PORT || 3000
const swaggerUi = require('swagger-ui-express')
const swaggerFile = require('./swagger-output.json')

app.use(express.json())
app.use(cors())
app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerFile))

const adminRouter = require('./routes/admin/admin.js')
app.use('/admin', adminRouter)

app.listen(PORT, (req, res) => {
	console.log(`Server is running on port ${PORT}.`)
})
