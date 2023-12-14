const express = require('express')
const router = express.Router()
const supabase = require('../../models/db.js')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const multer = require('multer')
const upload = multer({ dest: 'uploads/' })
const fs = require('fs')

async function checkAdminPermission(req, res, next) {
	try {
		// 토큰 추출 및 검증
		const authHeader = req.headers.authorization
		if (!authHeader) {
			return res.status(401).json({
				status: 'error',
				message: '인증 토큰이 없습니다.',
			})
		}

		const token = authHeader.split(' ')[1]
		const decoded = jwt.verify(token, process.env.SECRET_KEY)
		const userId = decoded.userId

		// 데이터베이스에서 사용자 역할 확인
		const { data, error } = await supabase.from('accounts').select('role').eq('id', userId)

		if (error || !data.length || (data[0].role !== 1 && data[0].role !== 2)) {
			return res.status(403).json({
				status: 'error',
				message: '권한이 없습니다.',
			})
		}

		// 사용자에게 권한이 있는 경우, 다음 미들웨어로 진행
		return next()
	} catch (err) {
		return res.status(401).json({
			status: 'error',
			message: '유효하지 않은 토큰입니다.',
		})
	}
}

router.post('/createAdmin', async (req, res) => {
	// 관리자 생성
	const token = req.headers.authorization.split(' ')[1]
	const decoded = jwt.verify(token, process.env.SECRET_KEY)
	const userId = decoded.userId

	// Supabase를 사용하여 사용자 역할 확인
	let { data: userData, error } = await supabase.from('accounts').select('role').eq('id', userId)

	if (error || !userData.length || userData[0].role !== 1) {
		return res.status(403).json({
			status: 'error',
			message: '권한이 없습니다.',
		})
	}

	const { username, phone, email, password } = req.body
	const fixedPhone = phone.replace(/[-\s]/g, '')
	const fixedEmail = email.replace(/\s/g, '')
	const hashedPassword = await bcrypt.hash(password, 10)

	if (!username || !fixedPhone || !fixedEmail || !password) {
		return res.status(400).json({
			status: 'error',
			message: '필수 항목을 모두 입력해주세요.',
		})
	}

	try {
		// Supabase를 사용하여 새로운 관리자 추가
		const { data, error } = await supabase.from('accounts').insert([{ username, phone: fixedPhone, email: fixedEmail, password: hashedPassword, role: 2 }])

		if (error) {
			throw error
		}

		res.status(201).json({
			status: 'success',
			message: '관리자가 성공적으로 생성되었습니다.',
		})
	} catch (err) {
		console.error('/createAdmin Error : ', err)
		res.status(500).json({
			status: 'error',
			message: '관리자 생성 중 서버 오류가 발생했습니다.',
		})
	}
})

router.post('/login', async (req, res) => {
	const { email, password } = req.body

	if (!email || !password) {
		return res.status(400).json({
			status: 'error',
			message: '필수 항목을 모두 입력해주세요.',
		})
	}

	try {
		// Supabase를 사용하여 데이터베이스에서 사용자 정보 조회
		const { data: userData, error } = await supabase.from('accounts').select('id, role, username, email, password').eq('email', email).single()

		if (error || !userData) {
			return res.status(401).json({ status: 'error', message: '사용자를 찾을 수 없습니다.' })
		}

		// 비밀번호 검증
		const isValid = await bcrypt.compare(password, userData.password)
		if (!isValid) {
			return res.status(402).json({ status: 'error', message: '비밀번호가 일치하지 않습니다.' })
		}

		// JWT 토큰 생성
		const accessToken = jwt.sign({ userId: userData.id, role: userData.role, username: userData.username, email: userData.email }, process.env.SECRET_KEY, { expiresIn: '1h' })
		const refreshToken = jwt.sign({ userId: userData.id }, process.env.REFRESH_SECRET_KEY, { expiresIn: '7d' })

		// 토큰 반환
		return res.status(201).json({
			status: 'success',
			message: '로그인 성공',
			result: {
				accessToken,
				refreshToken,
				role: userData.role,
				username: userData.username,
				email: userData.email,
			},
		})
	} catch (err) {
		console.error('/login Error : ', err)
		res.status(500).json({
			status: 'error',
			message: '로그인 중 서버 오류가 발생했습니다.',
		})
	}
})

router.post('/logout', checkAdminPermission, async (req, res) => {
	// ---------------------------- 로그아웃 ----------------------------
	try {
		const accessToken = jwt.sign({ userId: userId }, process.env.SECRET_KEY, {
			expiresIn: '1s', // 액세스 토큰의 유효 기간을 1초로 설정하여 즉시 만료
		})

		res.status(200).json({
			status: 'success',
			message: '로그아웃 되었습니다.',
		})
	} catch (err) {
		console.error('/logout Error: ', err)
		res.status(500).json({
			status: 'error',
			message: '로그아웃 중 서버 오류가 발생했습니다.',
		})
	}
})

router.post('/refreshToken', async (req, res) => {
	// ---------------------------- 리프레시 토큰 ----------------------------
	const refreshToken = req.body.refreshToken

	if (!refreshToken) {
		return res.status(400).json({
			status: 'error',
			message: '리프레시 토큰을 제공해야 합니다.',
		})
	}

	try {
		// 리프레시 토큰을 검증하고 사용자 정보를 얻음
		const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET_KEY)
		const userId = decoded.userId

		//

		// 새로운 액세스 토큰을 발급
		const accessToken = jwt.sign({ userId: userId }, process.env.SECRET_KEY, {
			expiresIn: '1h', // 액세스 토큰의 유효 기간
		})

		return res.status(201).json({
			status: 'success',
			message: '토큰이 성공적으로 재발급되었습니다.',
			result: { accessToken },
		})
	} catch (err) {
		console.error('/refreshToken Error: ', err)
		if (err instanceof jwt.JsonWebTokenError) {
			res.status(401).json({ status: 'error', message: '리프레시 토큰이 유효하지 않습니다.' })
		} else {
			res.status(500).json({ status: 'error', message: '토큰 재발급 중 서버 오류가 발생했습니다.' })
		}
	}
})

router.post('/addTest', upload.single('image'), checkAdminPermission, async (req, res) => {
	// ---------------------------- 테스트 생성 ----------------------------

	const { testName, testSubName, testDescription } = req.body
	const imageFile = req.file

	if (!testName || !testSubName || !testDescription || !imageFile) {
		return res.status(400).json({
			status: 'error',
			message: '필수 항목을 모두 입력해주세요.',
		})
	}

	try {
		const stream = fs.createReadStream(imageFile.path)
		const filePath = `tests/${imageFile.filename}`
		const { error: uploadError } = await supabase.storage.from('moco-images').upload(filePath, stream)
		if (uploadError) {
			throw uploadError
		}

		let created_at = new Date()

		// Supabase를 사용하여 psych_tests.Tests 테이블에 새로운 테스트 추가
		const { data, error } = await supabase.from('tests').insert({ name: testName, subName: testSubName, description: testDescription, is_published: false, path: filePath, created_at }).select()

		if (error) {
			throw error
		}

		res.status(201).json({
			status: 'success',
			message: '테스트가 성공적으로 추가되었습니다.',
			result: data[0],
		})
	} catch (err) {
		console.error('/addTest Error : ', err)
		res.status(500).json({
			status: 'error',
			message: '테스트 추가 중 서버 오류가 발생했습니다.',
		})
	}
})

router.post('/addType', checkAdminPermission, async (req, res) => {
	// ---------------------------- 테스트 타입 생성 ----------------------------

	const { testId, types } = req.body

	if (!testId || !types || !Array.isArray(types) || types.length < 2) {
		return res.status(400).json({
			status: 'error',
			message: '적절한 타입 데이터를 제공해주세요. 타입은 최소 2개 이상이어야 합니다.',
		})
	}

	try {
		// types 배열을 직접 순회하며 각 객체의 필드를 추출
		const typesData = types.map(({ type, description }) => ({
			test_id: testId,
			type: type,
			description: description,
		}))

		// Supabase를 사용하여 여러 행 추가
		const { error } = await supabase.from('types').insert(typesData)

		if (error) {
			throw error
		}

		res.status(201).json({
			status: 'success',
			message: '타입이 성공적으로 추가되었습니다.',
		})
	} catch (err) {
		console.error('/addType Error : ', err)
		res.status(500).json({
			status: 'error',
			message: '타입 추가 중 서버 오류가 발생했습니다.',
		})
	}
})

router.post('/addQuestion', checkAdminPermission, async (req, res) => {
	// ---------------------------- 테스트 질문 생성 ----------------------------
	const { testId, questions } = req.body

	if (!testId || !questions || !Array.isArray(questions) || questions.length < 4) {
		return res.status(400).json({
			status: 'error',
			message: '질문은 최소 4개 이상이어야 합니다.',
		})
	}

	for (const question of questions) {
		if (!question.content || !Array.isArray(question.types) || question.types.length === 0) {
			return res.status(400).json({
				status: 'error',
				message: '각 질문은 내용과 타입 목록을 가져야 합니다.',
			})
		}
	}

	try {
		// 질문 데이터를 생성하여 배열에 추가
		const questionData = questions.map((question) => ({
			test_id: testId,
			content: question.content,
			types: question.types,
		}))

		// Supabase를 사용하여 여러 질문 추가
		const { error } = await supabase.from('questions').insert(questionData)

		if (error) {
			throw error
		}

		res.status(201).json({
			status: 'success',
			message: '질문이 성공적으로 추가되었습니다.',
		})
	} catch (err) {
		console.error('/addQuestion Error : ', err)
		res.status(500).json({
			status: 'error',
			message: '질문 추가 중 서버 오류가 발생했습니다.',
		})
	}
})

router.get('/getTests', checkAdminPermission, async (req, res) => {
	// ---------------------------- 테스트 목록 조회 ----------------------------

	const search = req.query.search || ''
	const page = parseInt(req.query.page) || 1
	const limit = parseInt(req.query.limit) || 10
	const offset = (page - 1) * limit

	try {
		let query = supabase.from('tests').select('*', { count: 'exact' })

		if (search) {
			query = query.ilike('name', `%${search}%`)
		}

		// Supabase를 사용하여 테스트 목록 페이징하여 조회
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
		console.error('/getTests Error : ', err)
		res.status(500).json({
			status: 'error',
			message: '테스트 목록 조회 중 서버 오류가 발생했습니다.',
		})
	}
})

router.get('/getTests/:testId', checkAdminPermission, async (req, res) => {
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

		if (testError) throw testError

		// types 테이블에서 해당 테스트에 연관된 데이터 조회
		const { data: typesData, error: typesError } = await supabase.from('types').select('*').eq('test_id', testId)

		if (typesError) throw typesError

		// questions 테이블에서 해당 테스트에 연관된 데이터 조회
		const { data: questionsData, error: questionsError } = await supabase.from('questions').select('*').eq('test_id', testId)

		if (questionsError) throw questionsError

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
		res.status(500).json({
			status: 'error',
			message: '테스트 상세 조회 중 서버 오류가 발생했습니다.',
		})
	}
})

router.delete('/deleteTest/:testId', checkAdminPermission, async (req, res) => {
	// ---------------------------- 테스트 삭제 ----------------------------

	const testId = req.params.testId

	if (!testId) {
		return res.status(400).json({
			status: 'error',
			message: '테스트 ID를 제공해주세요.',
		})
	}

	try {
		// Supabase를 사용하여 관련된 질문과 타입을 삭제
		await supabase.from('questions').delete().match({ test_id: testId })

		await supabase.from('types').delete().match({ test_id: testId })

		// Supabase를 사용하여 테스트 삭제
		const { error } = await supabase.from('tests').delete().match({ id: testId })

		if (error) {
			throw error
		}

		res.status(200).json({
			status: 'success',
			message: '테스트가 성공적으로 삭제되었습니다.',
		})
	} catch (err) {
		console.error('/deleteTest Error : ', err)
		res.status(500).json({
			status: 'error',
			mesage: '테스트 삭제 중 서버 오류가 발생했습니다.',
		})
	}
})

router.put('/updateTestPublishState', checkAdminPermission, async (req, res) => {
	// ---------------------------- 테스트 공개여부 상태 업데이트 ----------------------------
	const { testId, isPublished } = req.body

	if (!testId || typeof isPublished !== 'boolean' || isPublished === undefined || isPublished === null) {
		return res.status(400).json({
			status: 'error',
			message: '적절한 데이터를 제공해주세요.',
		})
	}

	try {
		const { error } = await supabase.from('tests').update({ is_published: isPublished }).match({ id: testId })

		if (error) {
			throw error
		}

		res.status(200).json({
			status: 'success',
			message: '테스트 공개 여부가 성공적으로 수정되었습니다.',
		})
	} catch (err) {
		res.status(500).json({
			status: 'error',
			message: '테스트 공개 상태 변경 중 서버 오류가 발생했습니다.',
		})
	}
})

router.put('/updateTest/:testId', upload.single('image'), checkAdminPermission, async (req, res) => {
	// ---------------------------- 테스트 수정 ----------------------------
	const testId = req.params.testId
	const types = JSON.parse(req.body.types)
	const questions = JSON.parse(req.body.questions)
	const { testName, testSubName, testDescription, oldImagePath } = req.body
	const imageFile = req.file

	if (!testName || !testDescription || !testSubName) {
		return res.status(400).json({
			status: 'error',
			message: '필수 항목을 모두 입력해주세요.',
		})
	}

	if (!types || !Array.isArray(types) || types.length < 2) {
		return res.status(400).json({
			status: 'error',
			message: '적절한 타입 데이터를 제공해주세요. 타입은 최소 2개 이상이어야 합니다.',
		})
	}

	if (!questions || !Array.isArray(questions) || questions.length < 4) {
		return res.status(400).json({
			status: 'error',
			message: '질문은 최소 4개 이상이어야 합니다.',
		})
	}

	for (const question of questions) {
		if (!question.content || !Array.isArray(question.types) || question.types.length === 0) {
			return res.status(400).json({
				status: 'error',
				message: '각 질문은 내용과 타입 목록을 가져야 합니다.',
			})
		}
	}

	try {
		// 기존 이미지 삭제
		if (oldImagePath) {
			const { error: deleteError } = await supabase.storage.from('moco-images').remove([oldImagePath])
			if (deleteError) throw deleteError
		}

		// 새 이미지 업로드
		let filePath
		if (imageFile) {
			const stream = fs.createReadStream(imageFile.path)
			filePath = `tests/${imageFile.filename}`
			const { error: uploadError } = await supabase.storage.from('moco-images').upload(filePath, stream)
			if (uploadError) throw uploadError
		}
		// tests 테이블 업데이트
		const updateData = { name: testName, subName: testSubName, description: testDescription }
		if (filePath) updateData.path = filePath

		const { error } = await supabase.from('tests').update(updateData).eq('id', testId)
		if (error) throw error

		// types 테이블 수정
		for (const typeItem of types) {
			const { id, test_id, type, description } = typeItem

			const { error: typeError } = await supabase.from('types').update({ type, description }).match({ test_id: test_id, id: id })

			if (typeError) throw typeError
		}

		// questions 테이블 수정
		for (const question of questions) {
			const { error: questionError } = await supabase.from('questions').update(question).match({ test_id: testId, id: question.id })

			if (questionError) throw questionError
		}

		res.status(200).json({
			status: 'success',
			message: '테스트가 성공적으로 수정되었습니다.',
		})
	} catch (err) {
		console.error('/editTest Error : ', err)
		res.status(500).json({
			status: 'error',
			message: '테스트 수정 중 서버 오류가 발생했습니다.',
		})
	}
})

router.get('/getAdmins', checkAdminPermission, async (req, res) => {
	// ---------------------------- 관리자 목록 조회 ----------------------------
	try {
		const { data, error } = await supabase.from('accounts').select('id, role, username, phone, email').or('role.eq.1, role.eq.2')

		if (error) {
			throw error
		}

		res.status(200).json({
			status: 'success',
			message: '관리자 목록을 성공적으로 가져왔습니다.',
			result: data,
		})
	} catch (err) {
		res.status(500).json({
			status: 'error',
			message: '관리자 목록 조회 중 서버 오류가 발생했습니다.',
		})
	}
})

module.exports = router
