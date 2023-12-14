const express = require('express')
const router = express.Router()
const supabase = require('../../models/db.js')

router.get('/getTests', async (req, res) => {
	//  ------------------------- 사용자 테스트 목록 가져오기 -------------------------
	const search = req.query.search || ''
	const page = parseInt(req.query.page) || 1
	const limit = parseInt(req.query.limit) || 10
	const offset = (page - 1) * limit

	try {
		// Supabase를 사용하여 테스트 목록 페이징하여 조회
		let query = supabase.from('tests').select('*', { count: 'exact' })

		if (search) {
			query = query.ilike('name', `%${search}%`)
		}

		const { data, error, count } = await query.range(offset, offset + limit - 1)

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
			message: '테스트 목록 조회 중 서버 오류가 발생했습니다.',
		})
	}
})

router.get('/getTests/:testId', async (req, res) => {
	// ---------------------------- 테스트 상세 조회 ----------------------------
	if (!req.params.testId) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 ID를 제공해주세요.',
		})
	}

	try {
		const testId = req.params.testId

		// tests 테이블에서 특정 테스트 조회
		const { data: testData, error: testError } = await supabase.from('tests').select('*').eq('id', testId)

		if (testError) throw { stage: 'tests', error: testError }

		// types 테이블에서 해당 테스트에 연관된 데이터 조회
		const { data: typesData, error: typesError } = await supabase.from('types').select('*').eq('test_id', testId)

		if (typesError) throw { stage: 'types', error: typesError }

		// questions 테이블에서 해당 테스트에 연관된 데이터 조회
		const { data: questionsData, error: questionsError } = await supabase.from('questions').select('*').eq('test_id', testId)

		if (questionsError) throw { stage: 'questions', error: questionsError }

		res.status(200).json({
			status: 'success',
			message: '테스트 상세 조회를 성공적으로 가져왔습니다.',
			result: {
				test: testData,
				types: typesData,
				questions: questionsData,
			},
		})
	} catch (err) {
		console.error('/getTests/:testId Error : ', err)

		let errorMessage = '테스트 상세 조회 중 서버 오류가 발생했습니다.'

		if (err.stage === 'tests') {
			errorMessage = '테스트 정보를 가져오는 중 서버 오류가 발생했습니다.'
		} else if (err.stage === 'types') {
			errorMessage = '테스트 타입 정보를 가져오는 중 서버 오류가 발생했습니다.'
		} else if (err.stage === 'questions') {
			errorMessage = '테스트 질문 정보를 가져오는 중 서버 오류가 발생했습니다.'
		}
		res.status(500).json({
			status: 'error',
			message: errorMessage,
		})
	}
})

router.post('/getTestResult/:testId', async (req, res) => {
	// ---------------------------- 테스트 결과 조회 ----------------------------
	if (!req.params.testId) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 ID를 제공해주세요.',
		})
	}

	if (!req.body.types || !Array.isArray(req.body.types)) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 타입들을 제공해주세요.',
		})
	}

	try {
		const testId = req.params.testId
		const types = req.body.types

		// 각 타입의 출현 횟수 계산
		const frequencyMap = types.reduce((acc, val) => {
			acc[val] = (acc[val] || 0) + 1
			return acc
		}, {})

		// 가장 높은 출현 횟수 찾기
		const maxCount = Math.max(...Object.values(frequencyMap))

		// 가장 높은 출현 횟수를 가진 타입들 찾기
		const mostFrequent = Object.keys(frequencyMap).filter((key) => frequencyMap[key] === maxCount)

		console.log(mostFrequent)

		// 가장 많이 출현한 타입에 해당하는 데이터 조회
		const datas = await Promise.all(
			mostFrequent.map(async (type) => {
				const { data, error } = await supabase.from('types').select('*').eq('type', type).eq('test_id', testId)
				if (error) throw error
				return data
			})
		)

		res.status(200).json({
			status: 'success',
			message: '테스트 결과 조회를 성공적으로 가져왔습니다.',
			result: datas.flat(),
		})
	} catch (err) {
		console.error('/getTestResult/:testId Error : ', err)

		res.status(500).json({
			status: 'error',
			message: '테스트 결과 조회 중 서버 오류가 발생했습니다.',
		})
	}
})

router.post('/saveResult', async (req, res) => {
	// ---------------------------- 테스트 결과 저장 ----------------------------

	if (!req.body.testId) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 ID를 제공해주세요.',
		})
	}

	if (!req.body.type || !req.body.description) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 결과를 제공해주세요.',
		})
	}
	console.log(req.body)
	try {
		const { testId, types, descriptions } = req.body

		// 테스트 결과 저장을 위한 추가 정보 조회
		const { data: testData, error: testError } = await supabase.from('tests').select('name').eq('id', testId).single()

		if (testError) throw { stage: 'tests', error: testError }

		// types와 descriptions 배열의 각 요소를 순차적으로 삽입
		for (let i = 0; i < types.length; i++) {
			const type = types[i]
			const description = descriptions[i]

			const { error: saveError } = await supabase.from('result').insert({
				test_id: testId,
				name: testData.name,
				type: type,
				description: description,
			})

			if (saveError) throw saveError // 삽입 중 발생하는 첫 번째 에러에서 루프 중단
		}

		res.status(200).json({
			status: 'success',
			message: '테스트 결과가 성공적으로 저장되었습니다.',
		})
	} catch (err) {
		console.error('/saveResult Error : ', err)

		let errorMessage = '테스트 결과 저장 중 서버 오류가 발생했습니다.'

		if (err.stage === 'tests') {
			errorMessage = '테스트 정보를 가져오는 중 서버 오류가 발생했습니다.'
		} else if (err.stage === 'result') {
			errorMessage = '테스트 결과를 저장하는 중 서버 오류가 발생했습니다.'
		}

		res.status(500).json({
			status: 'error',
			message: errorMessage,
		})
	}
})

module.exports = router
