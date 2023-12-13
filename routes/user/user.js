const express = require('express')
const router = express.Router()
const supabase = require('../../models/db.js')

router.get('/getTests', async (req, res) => {
	//  ------------------------- 사용자 테스트 목록 가져오기 -------------------------
	const page = parseInt(req.query.page) || 1
	const limit = parseInt(req.query.limit) || 10
	const offset = (page - 1) * limit

	try {
		// Supabase를 사용하여 테스트 목록 페이징하여 조회
		const { data, error, count } = await supabase
			.from('tests')
			.select('*', { count: 'exact' })
			.range(offset, offset + limit - 1)

		if (error) {
			throw error
		}

		res.status(200).json({
			status: 'success',
			message: '테스트 목록을 성공적으로 가져왔습니다.',
			result: data,
			page: page,
			limit: limit,
			total: count,
		})
	} catch (err) {
		res.status(500).json({
			status: 'error',
			message: 'Error getting tests',
		})
	}
})

module.exports = router
