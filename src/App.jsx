import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Users, Download, ArrowRight, Settings, RotateCcw, Save, FileSpreadsheet, Move, Info, X, Link, Tag, AlertTriangle, Maximize2, Minimize2, Plus, Trash2, CheckCircle2, ArrowDownAZ, ArrowUpDown, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Unlink, Search, MousePointerClick, ExternalLink } from 'lucide-react';

/**
 * 스마트 반배정 마법사 v2.6 (복구 버전)
 * 특징:
 * 1. 동명이인 자동 감지 및 경고 표시
 * 2. 학생 검색 및 하이라이트
 * 3. 그룹 강제 해제 및 이동 기능
 * 4. (AI 기능 제외됨)
 */

const normalizeText = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const normalizeGender = (value) => {
  const raw = normalizeText(value);
  if (!raw) return '미상';

  const compact = raw.replace(/\s+/g, '').toLowerCase();
  if (compact.includes('남') && compact.includes('여')) return '미상';

  const male = new Set(['남', '남성', '남자', '남학생', 'm', 'male', 'boy', 'man']);
  const female = new Set(['여', '여성', '여자', '여학생', 'f', 'female', 'girl', 'woman']);

  if (male.has(compact)) return '남';
  if (female.has(compact)) return '여';

  if (compact.startsWith('남')) return '남';
  if (compact.startsWith('여')) return '여';

  return raw;
};

const TEMPLATE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/10LRewT3RIy1Hu1Z7fMZYH1ZOetXpPCKf8gFaiXKDK8Y/edit?usp=sharing';

const App = () => {
  const [step, setStep] = useState('upload'); // upload, config, dashboard
  const [students, setStudents] = useState([]);
  const [targetClassCount, setTargetClassCount] = useState(3);
  const [classes, setClasses] = useState({});
  const [draggedStudent, setDraggedStudent] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isCompact, setIsCompact] = useState(false); 
  const [dragOverClassId, setDragOverClassId] = useState(null); // 드래그 중인 반 ID
  const [isNameSorted, setIsNameSorted] = useState(false); // 이름순 정렬 상태
  const [searchTerm, setSearchTerm] = useState(''); // 검색어 상태
  const [noteDraft, setNoteDraft] = useState(''); // 비고 편집용 임시 값
  const [moveFocus, setMoveFocus] = useState(null); // { classId: string, studentIds: string[] }
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [isGridPanning, setIsGridPanning] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(() => {
    try {
      return localStorage.getItem('changeclass:headerCollapsed') === '1';
    } catch {
      return false;
    }
  });
  const [isSummaryHidden, setIsSummaryHidden] = useState(() => {
    try {
      return localStorage.getItem('changeclass:summaryHidden') === '1';
    } catch {
      return false;
    }
  });

  const classGridRef = useRef(null);
  const classColumnRefs = useRef({});
  const gridPanRef = useRef({ active: false, startX: 0, scrollLeft: 0 });
  const moveFocusTimeoutRef = useRef(null);

  // 모달이 열릴 때마다 현재 비고 내용을 편집 필드에 채워준다.
  useEffect(() => {
    if (selectedStudent) {
      setNoteDraft(selectedStudent.note || '');
    }
  }, [selectedStudent]);

  useEffect(() => {
    if (step !== 'dashboard') {
      setIsSpacePanning(false);
      setIsGridPanning(false);
      gridPanRef.current.active = false;
      return;
    }

    const isTypingTarget = (target) => {
      if (!target) return false;
      if (target.isContentEditable) return true;
      const tagName = String(target.tagName || '').toUpperCase();
      return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
    };

    const onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      setIsSpacePanning(true);
    };

    const onKeyUp = (e) => {
      if (e.code !== 'Space') return;
      setIsSpacePanning(false);
      setIsGridPanning(false);
      gridPanRef.current.active = false;
    };

    const onBlur = () => {
      setIsSpacePanning(false);
      setIsGridPanning(false);
      gridPanRef.current.active = false;
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [step]);

  useEffect(() => {
    try {
      localStorage.setItem('changeclass:headerCollapsed', isHeaderCollapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [isHeaderCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem('changeclass:summaryHidden', isSummaryHidden ? '1' : '0');
    } catch {
      // ignore
    }
  }, [isSummaryHidden]);

  useEffect(() => {
    if (!moveFocus) return;

    const targetClassId = moveFocus.classId;
    const targetStudentId = moveFocus.studentIds?.[0];

    const classEl = classColumnRefs.current?.[targetClassId];
    if (classEl) {
      classEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }

    if (!targetStudentId) return;

    const scrollStudentIntoView = () => {
      const studentEl = document.getElementById(`student-card-${targetStudentId}`);
      if (!studentEl) return false;
      studentEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      return true;
    };

    requestAnimationFrame(() => {
      if (scrollStudentIntoView()) return;
      setTimeout(scrollStudentIntoView, 120);
    });
  }, [moveFocus]);

  // 파일 업로드 및 파싱
  const handleFileUpload = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const isCsv = file.name?.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
      const wb = isCsv
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });

      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const parseAssignedClass = (value) => {
        if (value === undefined || value === null) return null;
        const matched = String(value).match(/(\d+)/);
        if (!matched) return null;
        const parsed = parseInt(matched[1], 10);
        return Number.isNaN(parsed) ? null : parsed;
      };

      const formattedData = data.map((row, index) => {
        const rawGroupId = row['그룹ID'] || row['그룹id'] || row['GroupID'] || '';
        const cleanGroupId = normalizeText(rawGroupId);
        const assignedClass = parseAssignedClass(
          row['배정반'] || row['배정 반'] || row['배정'] || row['신반']
        );
        const manualMoveFlag = row['수동이동여부'] || row['수동 이동 여부'] || row['수동이동'];
        const nameFromSeongmyeong = normalizeText(row['성명']);
        const nameFromIreum = normalizeText(row['이름']);
        const cleanName = nameFromSeongmyeong || nameFromIreum || '이름없음';

        return {
            id: `student-${index}`,
            name: cleanName,
            gender: normalizeGender(row['성별']),
            prevClass: normalizeText(row['반']),
            prevGrade: normalizeText(row['학년']),
            number: normalizeText(row['번호']),
            note: normalizeText(row['비고']),
            birth: normalizeText(row['생년월일']),
            groupId: cleanGroupId, 
            originalData: row,
            initialClass: assignedClass, 
            newClass: assignedClass,
            isManuallyMoved: normalizeText(manualMoveFlag) !== ''
        };
      });

      setSelectedStudent(null);

      const hasAssignedClasses = formattedData.some(s => typeof s.newClass === 'number');
      if (hasAssignedClasses) {
        const restoredClasses = {};

        formattedData.forEach(student => {
          const targetClass = student.newClass || 1;
          if (!restoredClasses[targetClass]) restoredClasses[targetClass] = [];
          restoredClasses[targetClass].push({
            ...student,
            newClass: targetClass,
            initialClass: student.initialClass ?? targetClass
          });
        });

        // 반 번호 순으로 정렬된 객체 생성
        const orderedClassIds = Object.keys(restoredClasses)
          .map(id => parseInt(id))
          .sort((a, b) => a - b);
        const orderedClasses = {};
        orderedClassIds.forEach(id => { orderedClasses[id] = restoredClasses[id]; });

        setClasses(orderedClasses);
        setTargetClassCount(Math.max(orderedClassIds.length, 1));
        setStudents(formattedData);
        setStep('dashboard');
        return;
      }

      setClasses({});
      setStudents(formattedData);
      setStep('config');
    } catch (error) {
      console.error(error);
      alert("파일을 읽는 중 오류가 발생했습니다. 파일 형식(.xlsx/.xls/.csv)과 컬럼명을 확인해주세요.");
    } finally {
      input.value = '';
    }
  };

  // 자동 반배정 로직
  const autoAssignClasses = () => {
    const newClasses = {};
    for (let i = 1; i <= targetClassCount; i++) {
      newClasses[i] = [];
    }

    const groupStudents = students.filter(s => s.groupId && s.groupId !== '');
    const normalStudents = students.filter(s => !s.groupId || s.groupId === '');

    const groups = {};
    groupStudents.forEach(s => {
      const gid = s.groupId;
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(s);
    });

    const sortedGroups = Object.keys(groups)
      .map(gid => ({ gid, members: groups[gid] }))
      .sort((a, b) => b.members.length - a.members.length);

    sortedGroups.forEach(({ members }) => {
      let minClass = 1;
      let minCount = Infinity;

      for (let i = 1; i <= targetClassCount; i++) {
        if (newClasses[i].length < minCount) {
          minCount = newClasses[i].length;
          minClass = i;
        }
      }

      members.forEach(member => {
        newClasses[minClass].push({ 
            ...member, 
            newClass: minClass,
            initialClass: minClass 
        });
      });
    });

    const boys = normalStudents.filter(s => s.gender === '남');
    const girls = normalStudents.filter(s => s.gender === '여');
    const others = normalStudents.filter(s => s.gender !== '남' && s.gender !== '여');

    const shuffle = (array) => array.sort(() => Math.random() - 0.5);
    const shuffledBoys = shuffle([...boys]);
    const shuffledGirls = shuffle([...girls]);
    const shuffledOthers = shuffle([...others]);

    const assignToBestClass = (student, genderType) => {
      let bestClass = 1;
      let minGenderCount = Infinity; 
      let minTotalCount = Infinity;

      Object.keys(newClasses).forEach(key => {
        const classId = parseInt(key);
        const currentList = newClasses[classId];
        const currentTotal = currentList.length;
        
        let currentGenderCount = 0;
        if (genderType === 'boy') {
            currentGenderCount = currentList.filter(s => s.gender === '남').length;
        } else if (genderType === 'girl') {
            currentGenderCount = currentList.filter(s => s.gender === '여').length;
        } else {
            currentGenderCount = currentTotal; 
        }

        if (currentGenderCount < minGenderCount) {
            minGenderCount = currentGenderCount;
            minTotalCount = currentTotal;
            bestClass = classId;
        } else if (currentGenderCount === minGenderCount) {
            if (currentTotal < minTotalCount) {
                minTotalCount = currentTotal;
                bestClass = classId;
            }
        }
      });

      newClasses[bestClass].push({ 
          ...student, 
          newClass: bestClass,
          initialClass: bestClass 
      });
    };

    shuffledBoys.forEach(s => assignToBestClass(s, 'boy'));
    shuffledGirls.forEach(s => assignToBestClass(s, 'girl'));
    shuffledOthers.forEach(s => assignToBestClass(s, 'other'));

    setClasses(newClasses);
    setStep('dashboard');
  };

  const addClass = () => {
    const nextId = Math.max(...Object.keys(classes).map(k => parseInt(k))) + 1;
    setClasses(prev => ({ ...prev, [nextId]: [] }));
  };

  const removeClass = (classId) => {
    if (classes[classId].length > 0) {
      alert("학생이 있는 반은 삭제할 수 없습니다. 먼저 학생들을 다른 반으로 이동시켜주세요.");
      return;
    }
    const newClasses = { ...classes };
    delete newClasses[classId];
    setClasses(newClasses);
  };

  // --- 드래그 앤 드롭 로직 ---
  const onDragStart = (e, student, fromClass) => {
    setDraggedStudent({ student, fromClass });
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e, classId) => {
    e.preventDefault();
    setDragOverClassId(classId);
  };

  const onDragLeave = () => {
    setDragOverClassId(null);
  };

  const onDrop = (e, targetClassId) => {
    e.preventDefault();
    setDragOverClassId(null);
    if (!draggedStudent) return;

    const { student, fromClass } = draggedStudent;
    const toClass = parseInt(targetClassId);

    if (parseInt(fromClass) === toClass) return;

    let freshStudent = null;
    if (classes[fromClass]) {
        freshStudent = classes[fromClass].find(s => s.id === student.id);
    }
    if (!freshStudent) freshStudent = student;

    if (freshStudent.groupId) {
        const sourceClassStudents = classes[fromClass];
        const currentGroupId = String(freshStudent.groupId).trim();
        const groupMates = sourceClassStudents.filter(s => 
            s.id !== freshStudent.id && String(s.groupId).trim() === currentGroupId
        );
        
        if (groupMates.length > 0) {
            const userChoice = window.confirm(
                `[그룹 이동 확인]\n` +
                `이 학생은 '${freshStudent.groupId}' 그룹 소속입니다.\n` +
                `함께 있는 ${groupMates.length}명의 친구들도 같이 이동할까요?\n\n` +
                `[확인] : 예, 그룹 전체를 함께 이동합니다.\n` +
                `[취소] : 아니요, 이 학생만 강제로 이동합니다. (그룹 해제)`
            );

            if (userChoice) {
                const studentsToMove = [freshStudent, ...groupMates];
                executeMoveStudents(fromClass, toClass, studentsToMove, false);
            } else {
                executeMoveStudents(fromClass, toClass, [freshStudent], true);
            }
            setDraggedStudent(null);
            return;
        }
    }

    executeMoveStudents(fromClass, toClass, [freshStudent], false);
    setDraggedStudent(null);
  };

  // --- 콤보박스 이동 로직 ---
  const moveStudent = (targetClassId) => {
    if (!selectedStudent) return;
    
    let currentClassId = null;
    let freshStudent = null;

    for (const classId of Object.keys(classes)) {
        const found = classes[classId].find(s => s.id === selectedStudent.id);
        if (found) {
            currentClassId = parseInt(classId);
            freshStudent = found;
            break;
        }
    }

    if (!freshStudent || !currentClassId) return;

    const toClass = parseInt(targetClassId);
    if (currentClassId === toClass) return;

    if (freshStudent.groupId) {
        const currentGroupId = String(freshStudent.groupId).trim();
        const groupMates = classes[currentClassId].filter(s => 
            s.id !== freshStudent.id && String(s.groupId).trim() === currentGroupId
        );

        if (groupMates.length > 0) {
            setTimeout(() => {
                const userChoice = window.confirm(
                    `[그룹 이동 확인]\n` +
                    `이 학생은 '${freshStudent.groupId}' 그룹 소속입니다.\n` +
                    `함께 있는 ${groupMates.length}명의 친구들도 같이 이동할까요?\n\n` +
                    `[확인] : 예, 그룹 전체를 함께 이동합니다.\n` +
                    `[취소] : 아니요, 이 학생만 강제로 이동합니다. (그룹 해제)`
                );

                if (userChoice) {
                    executeMoveStudents(currentClassId, toClass, [freshStudent, ...groupMates], false);
                } else {
                    executeMoveStudents(currentClassId, toClass, [freshStudent], true);
                }
            }, 10);
            return;
        }
    }

    executeMoveStudents(currentClassId, toClass, [freshStudent], false);
  };

  // --- 강제 그룹 해제 ---
  const ungroupStudent = () => {
      if (!selectedStudent) return;
      if (!window.confirm("정말로 이 학생의 그룹 연결을 끊으시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) return;

      let currentClassId = null;
      let freshStudent = null;

      for (const classId of Object.keys(classes)) {
          const found = classes[classId].find(s => s.id === selectedStudent.id);
          if (found) {
              currentClassId = parseInt(classId);
              freshStudent = found;
              break;
          }
      }

      if (!freshStudent) return;

      setClasses(prev => {
          const classList = prev[currentClassId];
          const updatedList = classList.map(s => {
              if (s.id === freshStudent.id) {
                  return {
                      ...s,
                      groupId: '', 
                      note: (s.note + ` (그룹 강제해제됨)`).trim()
                  };
              }
              return s;
          });

          return { ...prev, [currentClassId]: updatedList };
      });

      setSelectedStudent(prev => ({
          ...prev,
          groupId: '',
          note: (prev.note + ` (그룹 강제해제됨)`).trim()
      }));
  };

  // 비고 수정 (실시간 반영)
  const updateStudentNote = (studentId, newNote) => {
    setClasses(prev => {
      const updated = {};
      Object.keys(prev).forEach(classId => {
        updated[classId] = prev[classId].map(student => 
          student.id === studentId ? { ...student, note: newNote } : student
        );
      });
      return updated;
    });

    setStudents(prev => prev.map(student => 
      student.id === studentId ? { ...student, note: newNote } : student
    ));

    setSelectedStudent(prev => {
      if (!prev || prev.id !== studentId) return prev;
      return { ...prev, note: newNote };
    });
  };

  const handleNoteChange = (value) => {
    if (!selectedStudent) return;
    setNoteDraft(value);
    updateStudentNote(selectedStudent.id, value);
  };

  const triggerMoveFocus = (targetClassId, studentIds) => {
    const normalizedStudentIds = (studentIds || []).filter(Boolean);
    if (!targetClassId || normalizedStudentIds.length === 0) return;

    setMoveFocus({ classId: String(targetClassId), studentIds: normalizedStudentIds });

    if (moveFocusTimeoutRef.current) {
      clearTimeout(moveFocusTimeoutRef.current);
    }
    moveFocusTimeoutRef.current = setTimeout(() => {
      setMoveFocus(null);
    }, 1800);
  };

  // --- 공통 이동 실행 함수 ---
  const executeMoveStudents = (fromClass, toClass, studentsToMove, deleteGroupId) => {
    setClasses(prev => {
      const sourceList = prev[fromClass].filter(s => !studentsToMove.find(m => m.id === s.id));
      
      const movedStudents = studentsToMove.map(s => {
          let updatedS = {
              ...s,
              newClass: toClass,
              isManuallyMoved: true
          };

          if (deleteGroupId) {
              const oldGid = s.groupId;
              updatedS.groupId = '';
              updatedS.note = (updatedS.note + ` (그룹 ${oldGid}에서 분리이동)`).trim(); 
          }
          return updatedS;
      });

      const targetList = [...prev[toClass], ...movedStudents];
      
      return {
        ...prev,
        [fromClass]: sourceList,
        [toClass]: targetList
      };
    });

    if (selectedStudent && studentsToMove.find(s => s.id === selectedStudent.id)) {
        const movedTarget = studentsToMove.find(s => s.id === selectedStudent.id);
        setSelectedStudent(prev => ({
            ...prev,
            newClass: toClass,
            isManuallyMoved: true,
            groupId: deleteGroupId ? '' : prev.groupId, 
            note: deleteGroupId ? (prev.note + ` (그룹 ${movedTarget.groupId}에서 분리이동)`).trim() : prev.note
        }));
    }

    triggerMoveFocus(toClass, studentsToMove.map(s => s.id));
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new(); 
    
    let allStudents = [];
    Object.keys(classes).forEach(classId => {
      classes[classId].forEach(student => {
        const exportRow = {
          ...student.originalData,
          '배정반': `${classId}반`,
          '성명': student.name,
          '성별': student.gender,
          '비고': student.note,
          '그룹ID': student.groupId,
          '수동이동여부': student.isManuallyMoved ? 'O' : ''
        };
        allStudents.push(exportRow);
      });
    });

    allStudents.sort((a, b) => {
        const classA = parseInt(a['배정반'].replace(/[^0-9]/g, ''));
        const classB = parseInt(b['배정반'].replace(/[^0-9]/g, ''));
        if (classA !== classB) return classA - classB;
        return a['성명'].localeCompare(b['성명']);
    });

    const ws = XLSX.utils.json_to_sheet(allStudents);
    XLSX.utils.book_append_sheet(wb, ws, "반배정결과");
    XLSX.writeFile(wb, "2025학년도_반배정결과.xlsx");
  };

  const getStats = (studentList) => {
    const total = studentList.length;
    const boys = studentList.filter(s => s.gender === '남').length;
    const girls = studentList.filter(s => s.gender === '여').length;
    return { total, boys, girls };
  };

  const isSummaryVisible = !isCompact && !isSummaryHidden;

  const orderedClassIds = Object.keys(classes).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  const scrollClassGridBy = (direction) => {
    const grid = classGridRef.current;
    if (!grid) return;
    const amount = isCompact ? 180 : 320;
    grid.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  const scrollToClass = (classId) => {
    const classEl = classColumnRefs.current?.[String(classId)];
    if (!classEl) return;
    classEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  };

  const beginGridPan = (e) => {
    if (!isSpacePanning) return;
    if (e.button !== 0) return;
    const grid = classGridRef.current;
    if (!grid) return;

    e.preventDefault();
    gridPanRef.current.active = true;
    gridPanRef.current.startX = e.clientX;
    gridPanRef.current.scrollLeft = grid.scrollLeft;
    setIsGridPanning(true);

    try {
      grid.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  const updateGridPan = (e) => {
    if (!gridPanRef.current.active) return;
    const grid = classGridRef.current;
    if (!grid) return;

    e.preventDefault();
    const dx = e.clientX - gridPanRef.current.startX;
    grid.scrollLeft = gridPanRef.current.scrollLeft - dx;
  };

  const endGridPan = (e) => {
    if (!gridPanRef.current.active) return;
    gridPanRef.current.active = false;
    setIsGridPanning(false);

    const grid = classGridRef.current;
    try {
      grid?.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header
        className={`bg-indigo-600 text-white shadow-md sticky top-0 z-10 transition-all ${
          isHeaderCollapsed ? 'py-2 px-4' : 'p-4'
        }`}
      >
	        <div className="max-w-7xl mx-auto flex justify-between items-center">
	          <div className="flex items-center gap-2">
	            <Users className={isHeaderCollapsed ? 'w-5 h-5' : 'w-6 h-6'} />
	            <h1 className={`${isHeaderCollapsed ? 'text-lg' : 'text-xl'} font-bold`}>스마트 반배정 마법사 v2.6</h1>
	          </div>
	          <div className={`flex items-center ${isHeaderCollapsed ? 'gap-2' : 'gap-4'}`}>
	            <a
	              href="./배포용_사용설명서.html"
	              target="_blank"
	              rel="noreferrer"
	              className={`flex items-center bg-indigo-500 hover:bg-indigo-400 rounded transition font-medium border border-indigo-400 ${
	                isHeaderCollapsed ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'
	              }`}
	              title="사용설명서 열기"
	            >
	              <Info className="w-4 h-4 mr-1" /> 사용설명서
	            </a>
	            {step === 'dashboard' && isHeaderCollapsed && (
	              <button
	                onClick={exportExcel}
	                className="flex items-center px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 rounded text-xs font-bold shadow transition"
	                title="엑셀 저장"
	              >
	                <Download className="w-4 h-4 mr-1" /> 저장
	              </button>
	            )}
	            <button
	              type="button"
	              onClick={() => setIsHeaderCollapsed(prev => !prev)}
	              className="p-1.5 rounded-lg border border-indigo-400 bg-indigo-500 hover:bg-indigo-400 transition"
	              title={isHeaderCollapsed ? '헤더 펼치기' : '헤더 접기'}
	            >
	              {isHeaderCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
	            </button>
	            {step === 'dashboard' && !isHeaderCollapsed && (
	               <>
	                {/* 검색바 */}
	                <div className="relative mr-2">
	                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-indigo-200 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="학생 이름 검색..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-1.5 bg-indigo-700 border border-indigo-500 rounded-lg text-sm text-white placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-white/50 w-32 sm:w-48 transition-all focus:w-64"
                    />
                </div>

                <button 
                  onClick={() => setIsNameSorted(!isNameSorted)}
                  className={`flex items-center px-3 py-1 rounded text-sm transition font-medium border ${isNameSorted ? 'bg-indigo-800 border-indigo-900 text-indigo-100' : 'bg-indigo-500 border-indigo-400 text-white hover:bg-indigo-400'}`}
                  title={isNameSorted ? "배정순으로 보기" : "가나다순으로 보기"}
                >
                  {isNameSorted ? <ArrowUpDown className="w-4 h-4 mr-1" /> : <ArrowDownAZ className="w-4 h-4 mr-1" />}
                  {isNameSorted ? '배정순' : '가나다순'}
                </button>
                <div className="w-px h-6 bg-indigo-400 mx-1"></div>
                <button 
                  onClick={() => setIsCompact(!isCompact)}
                  className={`flex items-center px-3 py-1 rounded text-sm transition font-medium border ${isCompact ? 'bg-indigo-800 border-indigo-900 text-indigo-100' : 'bg-indigo-500 border-indigo-400 text-white hover:bg-indigo-400'}`}
                  title={isCompact ? "카드형 보기" : "한눈에 보기"}
                >
                  {isCompact ? <Minimize2 className="w-4 h-4 mr-1" /> : <Maximize2 className="w-4 h-4 mr-1" />}
                  {isCompact ? '카드형' : '한눈에'}
                </button>
                <div className="w-px h-6 bg-indigo-400 mx-1"></div>
                <button 
                  onClick={() => setStep('config')}
                  className="flex items-center px-3 py-1 bg-indigo-500 hover:bg-indigo-400 rounded text-sm transition"
                >
                  <RotateCcw className="w-4 h-4 mr-1" /> 재설정
                </button>
                <button 
                  onClick={exportExcel}
                  className="flex items-center px-4 py-1 bg-emerald-500 hover:bg-emerald-400 rounded text-sm font-bold shadow transition"
                >
                  <Download className="w-4 h-4 mr-1" /> 엑셀 저장
                </button>
               </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
	      <main
	        className={`max-w-7xl mx-auto ${step === 'dashboard' ? 'px-4 py-4' : 'p-6'} ${
	          isCompact ? 'max-w-[98%] px-2' : ''
	        }`}
	      >
        
        {/* 모바일 팁 */}
        {step === 'dashboard' && (
            <div className="lg:hidden mb-4 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm flex items-center shadow-sm border border-indigo-100 animate-fade-in">
                <MousePointerClick className="w-4 h-4 mr-2" />
                <span className="font-medium">Tip: 모바일에서는 카드를 터치하여 반을 이동하세요.</span>
            </div>
        )}

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] py-8 animate-fade-in">
            <div className="bg-white p-10 rounded-2xl shadow-xl text-center max-w-lg w-full border border-slate-200">
              <div className="bg-indigo-100 p-4 rounded-full inline-block mb-4">
                <FileSpreadsheet className="w-12 h-12 text-indigo-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">기초 자료 업로드</h2>
              <p className="text-slate-500 mb-6">
                '성명', '성별', '그룹ID', '비고' 등이 포함된 엑셀 파일을 올려주세요.<br/>
                <span className="text-xs text-slate-400">그룹ID가 같으면 <b>같은 반</b>에 배정됩니다.</span>
              </p>
              
              <label className="block w-full cursor-pointer group">
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 transition group-hover:border-indigo-500 group-hover:bg-indigo-50">
                  <div className="flex flex-col items-center">
                    <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 mb-2" />
                    <span className="text-sm font-medium text-slate-600 group-hover:text-indigo-600">
                      클릭하여 파일 선택하기
                    </span>
                  </div>
                  <input 
                    type="file" 
                    accept=".xlsx, .xls, .csv" 
                    className="hidden" 
                    onChange={handleFileUpload}
                  />
                </div>
              </label>

              <div className="mt-6 text-left">
                <a
                  href={TEMPLATE_SHEET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 transition text-sm font-bold text-slate-700"
                  title="구글 스프레드시트 양식 열기"
                >
                  <ExternalLink className="w-4 h-4 text-indigo-600" />
                  기초자료 양식(구글시트) 열기
                </a>
                <ol className="mt-3 text-xs text-slate-500 list-decimal ml-5 space-y-1">
                  <li>링크를 연 뒤, <b>파일 → 사본 만들기</b>로 내 드라이브에 복사합니다.</li>
                  <li>사본에서 학생 명단을 작성합니다.</li>
                  <li><b>파일 → 다운로드 → Microsoft Excel(.xlsx)</b>로 내려받습니다.</li>
                  <li>다운받은 <b>.xlsx</b> 파일을 이 화면에서 업로드하여 사용합니다.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Config */}
        {step === 'config' && (
          <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in">
             <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
                <h2 className="text-xl font-bold mb-6 flex items-center">
                  <Settings className="w-5 h-5 mr-2 text-indigo-600" /> 
                  반 배정 설정
                </h2>
                
                <div className="mb-6 bg-slate-50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                      <p className="text-sm text-slate-600">총 학생 수</p>
                      <p className="font-bold text-slate-900">{students.length}명</p>
                  </div>
                  <div className="flex justify-between items-center">
                      <p className="text-sm text-slate-600">동반 배정 그룹</p>
                      <p className="font-bold text-blue-600 flex items-center">
                        <Link className="w-3 h-3 mr-1" />
                        {new Set(students.filter(s => s.groupId).map(s => s.groupId)).size}개
                      </p>
                  </div>
                </div>

                <div className="mb-8">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    생성할 반 개수
                  </label>
                  <div className="flex items-center space-x-4">
                    <input 
                      type="range" 
                      min="2" 
                      max="15" 
                      value={targetClassCount} 
                      onChange={(e) => setTargetClassCount(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="text-xl font-bold w-12 text-center text-indigo-600">
                      {targetClassCount}반
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 text-right">
                    예상: 반당 약 {Math.floor(students.length / targetClassCount)}~{Math.ceil(students.length / targetClassCount)}명
                  </p>
                </div>

                <button 
                  onClick={autoAssignClasses}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition flex justify-center items-center shadow-lg hover:shadow-indigo-500/30"
                >
                  배정 시작 <ArrowRight className="ml-2 w-4 h-4" />
                </button>
             </div>
          </div>
        )}

	        {/* Step 3: Dashboard */}
	        {step === 'dashboard' && (
		          <div className="animate-fade-in">
		            {/* 상단 요약 바 */}
		            {isSummaryVisible && (
		              <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-3 flex flex-wrap gap-4 items-center justify-between">
	                <div className="text-sm text-slate-500">
	                  총 <span className="font-bold text-slate-900">{students.length}</span>명 배정 완료
	                  <span className="mx-2 text-slate-300">|</span>
	                  <span className="text-blue-600 font-medium">남 {students.filter(s => s.gender === '남').length}</span>
	                  <span className="mx-1">/</span>
	                  <span className="text-pink-600 font-medium">여 {students.filter(s => s.gender === '여').length}</span>
	                </div>
	                <div className="flex items-center gap-2 text-xs text-slate-500">
	                    <div className="flex items-center mr-3">
	                         <span className="w-2 h-2 bg-blue-500 rounded-full mr-1"></span> 수동 이동됨
	                    </div>
	                    <div className="text-blue-600 flex items-center bg-blue-50 px-3 py-1 rounded-full font-medium">
	                        <Link className="w-3 h-3 mr-1" /> 그룹 배정
	                    </div>
	                    <button
	                      type="button"
	                      onClick={() => setIsSummaryHidden(true)}
	                      className="ml-1 p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition"
	                      title="요약 숨기기"
	                    >
	                      <X className="w-4 h-4" />
	                    </button>
	                </div>
		              </div>
		            )}

		            {/* 반 바로가기 / 가로 스크롤 컨트롤 (PC) */}
		            <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 mb-3 flex items-center gap-2">
		              <span className="text-xs font-bold text-slate-600 whitespace-nowrap">반 바로가기</span>
		              {!isCompact && isSummaryHidden && (
		                <button
		                  type="button"
		                  onClick={() => setIsSummaryHidden(false)}
		                  className="px-2 py-1 rounded-full text-[11px] font-bold border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-slate-700 transition whitespace-nowrap"
		                  title="요약 표시"
		                >
		                  요약 보기
		                </button>
		              )}
		              <div className="hidden lg:flex items-center gap-1">
		                <button
		                  type="button"
		                  onClick={() => scrollClassGridBy(-1)}
	                  className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition"
	                  title="왼쪽으로 이동"
	                >
	                  <ChevronLeft className="w-4 h-4" />
	                </button>
	                <button
	                  type="button"
	                  onClick={() => scrollClassGridBy(1)}
	                  className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition"
	                  title="오른쪽으로 이동"
	                >
	                  <ChevronRight className="w-4 h-4" />
	                </button>
	              </div>
		              <div className="flex-1 overflow-x-auto scrollbar-none">
	                <div className="flex items-center gap-1 min-w-max">
	                  {orderedClassIds.map(classId => {
	                    const isMoveFocusedClass = moveFocus?.classId === String(classId);
	                    return (
	                      <button
	                        key={classId}
	                        type="button"
	                        onClick={() => scrollToClass(classId)}
	                        className={`px-2.5 py-1 rounded-full text-xs font-bold border transition whitespace-nowrap ${
	                          isMoveFocusedClass
	                            ? 'bg-indigo-600 text-white border-indigo-600'
	                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200'
	                        }`}
	                        title={`${classId}반으로 이동`}
	                      >
	                        {classId}반
	                      </button>
	                    );
	                  })}
		                </div>
		              </div>
		              <span className="hidden lg:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
		                <span className="inline-flex items-center gap-1">
		                  <span className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[11px] font-mono text-slate-700">
		                    Space
		                  </span>
		                  <span className="text-slate-400">+</span>
		                  <span>좌클릭 드래그로 좌우 이동</span>
		                </span>
		                <span className="text-slate-300">|</span>
		                <span>학생 이동 시 자동 이동</span>
		              </span>
		            </div>

		            {/* 반별 컬럼 그리드 */}
		            <div
		              ref={classGridRef}
		              onPointerDown={beginGridPan}
		              onPointerMove={updateGridPan}
		              onPointerUp={endGridPan}
			              onPointerLeave={endGridPan}
			              onPointerCancel={endGridPan}
			              className={`flex gap-4 overflow-x-auto scrollbar-none pb-3 min-h-[500px] lg:min-h-0 ${
			                isHeaderCollapsed
			                  ? isSummaryVisible
			                    ? 'lg:h-[calc(100vh-200px)]'
			                    : 'lg:h-[calc(100vh-160px)]'
			                  : isSummaryVisible
			                    ? 'lg:h-[calc(100vh-240px)]'
			                    : 'lg:h-[calc(100vh-200px)]'
			              } ${isSpacePanning ? 'cursor-grab' : ''} ${isGridPanning ? 'cursor-grabbing select-none' : ''}`}
			            >
	              {orderedClassIds.map(classId => {
	                const classStudents = classes[classId];
	                const stats = getStats(classStudents);
	                const isDragOver = parseInt(dragOverClassId) === parseInt(classId);
	                const isMoveFocusedClass = moveFocus?.classId === String(classId);

	                // 정렬 로직 적용
	                const displayStudents = isNameSorted 
	                    ? [...classStudents].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
	                    : classStudents;

                // 반 내 동명이인 파악
                const nameCounts = {};
                classStudents.forEach(s => {
                    nameCounts[s.name] = (nameCounts[s.name] || 0) + 1;
                });
                const hasDuplicateNames = Object.values(nameCounts).some(count => count > 1);
                
	                return (
	                  <div 
	                    key={classId}
	                    ref={(el) => {
	                      if (el) classColumnRefs.current[String(classId)] = el;
	                      else delete classColumnRefs.current[String(classId)];
	                    }}
	                    onDragOver={(e) => onDragOver(e, classId)}
	                    onDragLeave={onDragLeave}
	                    onDrop={(e) => onDrop(e, classId)}
	                    className={`
	                        flex flex-col rounded-xl border-2 transition-all duration-200 relative
	                        ${isCompact ? 'w-[160px] min-w-[160px]' : 'w-[280px] min-w-[280px]'}
	                        ${isDragOver 
	                            ? 'bg-indigo-50 border-indigo-400 shadow-lg scale-[1.02]' 
	                            : 'bg-slate-100 border-transparent hover:border-slate-300'
	                        }
	                        ${isMoveFocusedClass ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-50' : ''}
	                    `}
	                  >
	                    {/* 반 헤더 */}
	                    <div className={`bg-white rounded-t-xl shadow-sm border-b border-slate-200 sticky top-0 z-10 ${isCompact ? 'p-2' : 'p-4'}`}>
	                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center">
                            <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-lg'}`}>{classId}반</h3>
                            {hasDuplicateNames && (
                                <span className="ml-1 text-[10px] bg-orange-100 text-orange-600 px-1 py-0.5 rounded font-medium flex items-center" title="반 내 동명이인이 있습니다">
                                    <AlertTriangle className="w-3 h-3 mr-0.5" /> 동명
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {classStudents.length === 0 && (
                                <button 
                                    onClick={() => removeClass(classId)}
                                    className="text-slate-400 hover:text-red-500 p-1"
                                    title="빈 반 삭제"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                            <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-md font-medium">
                            {stats.total}
                            </span>
                        </div>
                      </div>
                      <div className="flex text-xs space-x-1">
                        <span className={`flex-1 bg-blue-50 text-blue-700 rounded text-center ${isCompact ? 'py-0.5 text-[10px]' : 'py-1 px-2'}`}>
                          남 {stats.boys}
                        </span>
                        <span className={`flex-1 bg-pink-50 text-pink-700 rounded text-center ${isCompact ? 'py-0.5 text-[10px]' : 'py-1 px-2'}`}>
                          여 {stats.girls}
                        </span>
                      </div>
	                    </div>

	                    {/* 학생 리스트 */}
	                    <div className={`flex-1 overflow-y-auto overscroll-contain ${isCompact ? 'p-1 space-y-1' : 'p-3 space-y-2'} min-h-[300px] lg:min-h-0`}>
	                      {displayStudents.map(student => {
	                        const isSearchActive = searchTerm.length > 0;
	                        const isMatch = isSearchActive && student.name.includes(searchTerm);
	                        const isDimmed = isSearchActive && !isMatch;
	                        const isMoveFocusedStudent =
	                          isMoveFocusedClass && Array.isArray(moveFocus?.studentIds) && moveFocus.studentIds.includes(student.id);
	                        
	                        // 동명이인 체크
	                        const isDuplicateName = nameCounts[student.name] > 1;

		                        return (
		                            <div
		                            key={student.id}
		                            id={`student-card-${student.id}`}
		                            draggable={!isSpacePanning}
		                            onDragStart={(e) => onDragStart(e, student, classId)}
		                            onClick={() => {
		                              if (isSpacePanning) return;
		                              setSelectedStudent(student);
		                            }}
		                            className={`
		                                rounded-lg shadow-sm border transition-all duration-300 group relative
		                                ${isCompact ? 'p-1.5' : 'p-3'}
		                                ${student.gender === '남' ? 'border-l-4 border-l-blue-400' : ''}
		                                ${student.gender === '여' ? 'border-l-4 border-l-pink-400' : ''}
		                                ${isMatch 
		                                    ? 'bg-yellow-50 ring-4 ring-yellow-400 ring-opacity-50 scale-105 z-10 border-yellow-200' 
		                                    : isMoveFocusedStudent
		                                      ? 'bg-indigo-50 ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-50 border-indigo-200 shadow-md'
		                                    : `bg-white border-slate-200 hover:shadow-md hover:border-indigo-300 ${isSpacePanning ? 'cursor-grab' : 'cursor-move'}`
		                                }
		                                ${isDimmed ? 'opacity-30 grayscale blur-[1px]' : ''}
		                            `}
		                            >
                            <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                <div className={`font-bold flex items-center gap-1 ${isCompact ? 'text-xs truncate' : ''} ${isMatch ? 'text-slate-900 text-lg' : 'text-slate-800'}`}>
                                    <span className="truncate">{student.name}</span>
                                    {isDuplicateName && (
                                        <span title="반 내 동명이인">
                                            <AlertTriangle className="w-3.5 h-3.5 text-orange-500 fill-orange-100" />
                                        </span>
                                    )}
                                    {student.isManuallyMoved && (
                                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full block flex-shrink-0" title="수동 이동됨"></span>
                                    )}
                                    {student.note && (
                                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full block flex-shrink-0" title="비고 있음"></span>
                                    )}
                                    {student.groupId && (
                                    <span className={`inline-flex items-center rounded font-medium bg-blue-100 text-blue-800 ${isCompact ? 'p-0.5 text-[8px]' : 'px-1.5 py-0.5 text-[10px]'}`}>
                                        <Link className={`mr-0.5 ${isCompact ? 'w-2 h-2' : 'w-3 h-3'}`} />
                                        {!isCompact && student.groupId}
                                    </span>
                                    )}
                                </div>
                                
                                {!isCompact && (
                                    <>
                                        <div className="text-xs text-slate-400 mt-0.5">
                                            {student.prevGrade && `${student.prevGrade}-`}{student.prevClass && `${student.prevClass}반`}
                                        </div>
                                        {student.note && (
                                            <div className="mt-2 text-xs bg-yellow-50 text-yellow-800 p-1.5 rounded border border-yellow-100 break-words">
                                            {student.note}
                                            </div>
                                        )}
                                    </>
                                )}
                                </div>
                            </div>
                            </div>
                        );
                      })}
                      {classStudents.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs border-2 border-dashed border-slate-200 rounded-lg m-2 min-h-[100px]">
                          <Move className="w-6 h-6 mb-2 opacity-50" />
                          <span className="text-center">드래그 또는<br/>클릭하여 이동</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* 반 추가 버튼 */}
              <div className="flex flex-col justify-center min-w-[100px]">
                <button 
                  onClick={addClass}
                  className="group flex flex-col items-center justify-center w-full h-[120px] rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 transition-all text-slate-400 hover:text-indigo-600"
                  title="새로운 반 추가"
                >
                  <div className="bg-white p-2 rounded-full shadow-sm mb-2 group-hover:scale-110 transition-transform">
                    <Plus className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-medium">반 추가</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 학생 상세 모달 */}
        {selectedStudent && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedStudent(null)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-slate-900 flex items-center">
                    {selectedStudent.name}
                    {selectedStudent.groupId && (
                        <span className="ml-2 inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            <Link className="w-3 h-3 mr-1" /> 그룹: {selectedStudent.groupId}
                        </span>
                    )}
                </h3>
                <button onClick={() => setSelectedStudent(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <span className="text-xs text-slate-500 block">성별</span>
                    <span className="font-medium">{selectedStudent.gender}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg">
                     <span className="text-xs text-slate-500 block">생년월일</span>
                     <span className="font-medium">{selectedStudent.birth || '-'}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <span className="text-xs text-slate-500 block">이전 반</span>
                    <span className="font-medium">{selectedStudent.prevGrade}학년 {selectedStudent.prevClass}반 {selectedStudent.number}번</span>
                  </div>
                  
                  {/* 변경된 부분: 콤보 박스로 반 이동 가능 */}
                  <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                    <label className="text-xs text-indigo-600 block font-bold mb-1">현재 배정 (반 이동)</label>
                    <div className="relative">
                        <select 
                            value={selectedStudent.newClass} 
                            onChange={(e) => moveStudent(e.target.value)}
                            className="w-full bg-white border border-indigo-200 text-indigo-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 pr-8 font-bold appearance-none cursor-pointer hover:bg-indigo-50 transition-colors"
                        >
                            {Object.keys(classes).sort((a,b) => parseInt(a)-parseInt(b)).map(classId => (
                                <option key={classId} value={classId}>{classId}반</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-indigo-600">
                            <ChevronDown className="h-4 w-4" />
                        </div>
                    </div>
                  </div>
                </div>

                {selectedStudent.isManuallyMoved && (
                     <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-start">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 mr-2 mt-0.5" />
                        <div>
                            <span className="text-xs text-blue-600 block font-bold mb-1">수동 이동됨</span>
                            <p className="text-xs text-slate-600">
                                자동 배정된 반({selectedStudent.initialClass}반)에서 수동으로 이동되었습니다.
                            </p>
                        </div>
                    </div>
                )}

                {selectedStudent.groupId && (
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                         <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-blue-600 font-bold flex items-center">
                                <Link className="w-3 h-3 mr-1" /> 동반 배정 그룹
                            </span>
                            {/* 새로운 그룹 해제 버튼 */}
                            <button 
                                onClick={ungroupStudent}
                                className="text-[10px] bg-white border border-blue-200 hover:bg-blue-100 text-blue-600 px-2 py-0.5 rounded flex items-center transition-colors"
                            >
                                <Unlink className="w-3 h-3 mr-1" /> 그룹 해제
                            </button>
                         </div>
                         <p className="text-xs text-slate-600">
                             ID: {selectedStudent.groupId} (이 그룹 학생들은 함께 다닙니다.)
                         </p>
                    </div>
                )}

                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-yellow-600 block font-bold">비고 사항</span>
                    <span className="text-[10px] text-yellow-700">입력 시 자동 저장</span>
                  </div>
                  <textarea
                    value={noteDraft}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    rows={4}
                    className="w-full text-sm text-slate-800 bg-white rounded border border-yellow-200 focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 p-2 resize-none"
                    placeholder="특이사항, 유의점 등을 입력하세요."
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button 
                  onClick={() => setSelectedStudent(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium transition"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
