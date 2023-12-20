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
const userRouter = require('./routes/user/user.js')
app.use('/admin', adminRouter)
app.use('/user', userRouter)

process.on('uncaughtException', (err) => {
	console.error('uncaughtException 발생 : ', err)

	if (err.code === 'EADDRINUSE') {
		console.error('포트가 이미 사용 중입니다.')
		process.exit(1)
	} else if (err.code === 'EACCES') {
		console.error('권한이 없습니다.')
		process.exit(1)
	} else if (err.code === 'ECONNREFUSED') {
		console.error('DB에 연결할 수 없습니다.')
		process.exit(1)
	} else if (err.code === 'ENOTFOUND') {
		console.error('DB에 연결할 수 없습니다.')
		process.exit(1)
	} else if (err.code === 'PROTOCOL_CONNECTION_LOST') {
		console.error('DB 연결이 끊어졌습니다.')
		process.exit(1)
	} else if (err.code === 'ER_CON_COUNT_ERROR') {
		console.error('DB 연결이 너무 많습니다.')
		process.exit(1)
	} else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
		console.error('DB에 접근할 수 없습니다.')
		process.exit(1)
	} else {
		console.error('알 수 없는 에러가 발생했습니다.')
		process.exit(1)
	}
})

app.listen(PORT, (req, res) => {
	console.log(`Server is running on port ${PORT}.`)
})
