const swaggerAutogen = require('swagger-autogen')()

const doc = {
	info: {
		title: 'Moco API',
		description: 'Moco API 문서입니다.',
	},
	host: `localhost:${process.env.PORT}`,
}

const outputFile = './swagger-output.json'
const routes = ['./routes/admin/admin.js']

swaggerAutogen(outputFile, routes, doc)
