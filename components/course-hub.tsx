'use client';
import { useRef, useState, useEffect } from 'react';
import {
  ArrowRight,
  BookOpen,
  Camera,
  FileText,
  Upload,
  Pause,
  Check,
  Clock3,
  Plus,
} from 'lucide-react';
import { useReview } from './review-context';
import { extractFile } from '@/lib/importer';
import { createCourse, prepareCourse } from '@/lib/course-client';
import { currentNamespace } from '@/lib/store';
import { type Course } from '@/lib/course-model';
import { type Subject } from '@/lib/model';
import { courseErrorMessage } from '@/lib/course-errors';
export default function CourseHub({ subject }: { subject: Subject }) {
  const { data, navigate, refresh, notify, aiReady } = useReview();
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(''),
    [source, setSource] = useState(''),
    [files, setFiles] = useState<string[]>([]),
    [working, setWorking] = useState(''),
    [cameraOpen, setCameraOpen] = useState(false),
    [cameraReady, setCameraReady] = useState(false),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState(''),
    [live, setLive] = useState<Course | null>(null);
  const input = useRef<HTMLInputElement>(null),
    video = useRef<HTMLVideoElement>(null),
    cameraStream = useRef<MediaStream | null>(null),
    stop = useRef(false),
    busy = useRef(false),
    origin = useRef(currentNamespace());
  useEffect(
    () => () => {
      stop.current = true;
      cameraStream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(() => {
    if (!cameraOpen || !video.current || !cameraStream.current) return;
    video.current.srcObject = cameraStream.current;
    void video.current.play().catch(() => setError('摄像头预览未能启动，请检查浏览器权限。'));
  }, [cameraOpen]);
  const courses =
    data.jobs
      ?.filter((j): j is Course => j.kind === 'course' && j.subject === subject)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? [];
  const materials = data.materials.filter((m) => m.subject === subject);
  const shown = live && live.subject === subject ? live : null;
  function closeCamera() {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    setCameraReady(false);
    setCameraOpen(false);
  }
  async function openCamera() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('此浏览器不支持直接拍摄，请使用“导入学习资料”选择已有照片。');
      return;
    }
    try {
      cameraStream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      setCameraOpen(true);
    } catch {
      setError('摄像头未能开启。请允许摄像头权限，或使用“导入学习资料”选择已有照片。');
    }
  }
  async function takePhoto() {
    const live = video.current;
    if (!live?.videoWidth || !live.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = live.videoWidth;
    canvas.height = live.videoHeight;
    canvas.getContext('2d')?.drawImage(live, 0, 0);
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('照片保存失败，请重拍。')), 'image/jpeg', 0.92),
      );
      closeCamera();
      await readFiles([new File([blob], `教材照片-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '拍摄失败，请重试。');
    }
  }
  async function readFiles(list: FileList | File[] | null) {
    if (!list?.length || busy.current) return;
    busy.current = true;
    setError('');
    const ns = currentNamespace();
    try {
      let text = source;
      const names = [...files];
      for (const file of Array.from(list).slice(0, 8)) {
        setWorking('正在识别 ' + file.name);
        const parsed = await extractFile(file);
        if (!parsed.text?.trim())
          throw new Error('该文件未包含可识别的文字，请使用教材图片或文本文件');
        text += (text ? '\n\n' : '') + parsed.text;
        names.push(file.name);
      }
      if (currentNamespace() !== ns) return;
      setSource(text);
      setFiles(names);
      setEditing(true);
      notify('识别完成，请核对教材文字、公式和图表说明');
    } catch (e) {
      if (currentNamespace() !== ns) return;
      const message = courseErrorMessage(e);
      setError(message);
      notify(message);
    } finally {
      busy.current = false;
      setWorking('');
    }
  }
  async function prepare(existing?: Course) {
    if (busy.current) return;
    busy.current = true;
    stop.current = false;
    const ns = currentNamespace();
    origin.current = ns;
    setError('');
    setWorking('正在检查已有课程');
    try {
      const found = existing
        ? { course: existing, reused: true }
        : await createCourse(subject, title, source, files, ns);
      setLive(found.course);
      await refresh();
      if (found.course.status === 'ready') {
        notify('已打开相同资料的现有课程，无需重新生成');
        navigate('course', found.course.id);
        return;
      }
      const result = await prepareCourse(
        found.course,
        (course, message) => {
          if (currentNamespace() === ns) {
            setLive(course);
            setWorking(message);
          }
        },
        stop,
        ns,
      );
      if (currentNamespace() !== ns) return;
      await refresh();
      setLive(result);
      if (result.status === 'ready') {
        setEditing(false);
        navigate('course', result.id);
      }
    } catch (e) {
      if (currentNamespace() !== ns) return;
      const message = courseErrorMessage(e);
      setError(message);
      notify(message);
      await refresh();
    } finally {
      busy.current = false;
      setWorking('');
    }
  }
  return (
    <div className="course-hub">
      {cameraOpen && (
        <div className="camera-capture-backdrop" role="presentation" onMouseDown={closeCamera}>
          <section className="camera-capture-dialog" role="dialog" aria-modal="true" aria-label="拍摄教材或笔记" onMouseDown={(event) => event.stopPropagation()}>
            <div className="camera-capture-head"><div><strong>拍摄教材或笔记</strong><p>请将文字置于画面中央，拍摄后在本机识别并校对。</p></div><button className="quiet" onClick={closeCamera} aria-label="关闭摄像头">关闭</button></div>
            <video ref={video} autoPlay playsInline muted onLoadedMetadata={() => setCameraReady(true)} />
            <div className="camera-capture-actions"><button className="secondary" onClick={closeCamera}>取消</button><button className="primary" disabled={!cameraReady} onClick={() => void takePhoto()}><Camera size={16} /> 拍照并识别</button></div>
          </section>
        </div>
      )}
      <section className="course-intro">
        <div>
          <p className="eyebrow">COURSE REVIEW</p>
          <h2>课程复习</h2>
          <p>
            以教材与笔记为依据，依次完成概念讲解、例题分析、理解检验和巩固练习。
          </p>
        </div>
        <button
          className={courses.length ? 'secondary' : 'primary'}
          onClick={() => setEditing(!editing)}
        >
          <Plus size={16} />
          建立课程
        </button>
      </section>
      {error && (
        <div className="course-error" role="alert">
          <div>
            <strong>操作未完成</strong>
            <p>{error}</p>
            <p>请按提示重试；已保存的资料和课程不会因此删除。</p>
          </div>
        </div>
      )}
      {(editing || !courses.length) && (
        <section className="panel course-create">
          <div className="section-head">
            <h3>添加学习资料</h3>
            <span className="muted">相同资料自动复用</span>
          </div>
          <div className="course-input-actions">
            <button
              onClick={() => void openCamera()}
              disabled={!!working}
            >
              <Camera size={18} />
              <b>拍摄教材或笔记</b>
              <span>识别后校对文字</span>
            </button>
            <button onClick={() => input.current?.click()} disabled={!!working}>
              <Upload size={18} />
              <b>导入学习资料</b>
              <span>图片、PDF、Word、文本</span>
            </button>
          </div>
          <input
            hidden
            ref={input}
            type="file"
            multiple
            accept="image/*,.pdf,.docx,.pptx,.txt,.md"
            onChange={(e) => {
              void readFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {materials.length > 0 && (
            <label>
              从资料库选择
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  const m = materials.find((m) => m.id === e.target.value);
                  if (m) {
                    setSource(m.text);
                    setFiles([m.name]);
                    if (!title) setTitle(m.name);
                  }
                }}
              >
                <option value="">选择已保存资料</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            课程名称
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="例如：细胞结构与生命活动"
            />
          </label>
          <label>
            教材内容、笔记或知识点
            <textarea
              aria-label="课程学习资料"
              rows={9}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={60000}
              placeholder="粘贴教材原文、课堂笔记，或输入需要系统学习的知识点。图片中的图表、公式和手写内容请在识别后核对、补充。"
            />
          </label>
          <div className="course-source-meta">
            <span>{source.length.toLocaleString()} / 60,000 字</span>
            <span>
              {files.length
                ? files.length + ' 份资料已识别'
                : '支持直接输入知识点'}
            </span>
          </div>
          <details className="course-source-help">
            <summary>资料识别与课程编制说明</summary>
            <p>
              图片文字在本机识别。生成课程时，校对后的文字将用于课程编制；图片中未被识别的示意图、公式和标注需要补充说明。课程按资料顺序分节，原文保留以供核对；每节包含完整讲解、例题、对比、过程分析和检验题。
            </p>
          </details>
          <div className="button-row">
            <button
              className="primary"
              disabled={!!working || !source.trim() || !aiReady}
              onClick={() => void prepare()}
            >
              {working || '编制并保存课程'}
              <ArrowRight size={16} />
            </button>
            {!!working && (
              <button
                className="secondary"
                onClick={() => {
                  stop.current = true;
                  setWorking('当前小节保存后暂停');
                }}
              >
                <Pause size={16} />
                暂停
              </button>
            )}
          </div>
          {!aiReady && (
            <p className="muted">
              课程生成服务暂不可用，已保存的课程可继续学习。
            </p>
          )}
        </section>
      )}
      {shown && shown.status !== 'ready' && (
        <section className="panel course-build-status">
          <div className="section-head">
            <h3>{shown.title}</h3>
            <span>
              {shown.sections.filter((s) => s.content).length} /{' '}
              {shown.sections.length} 节已保存
            </span>
          </div>
          <progress
            value={shown.sections.filter((s) => s.content).length}
            max={shown.sections.length}
          />
          <p className="muted">
            {working ||
              (shown.sections.find((s) => s.error)?.error
                ? courseErrorMessage(shown.sections.find((s) => s.error)?.error)
                : '') ||
              '进度已保存，可继续编制。'}
          </p>
          {!working && (
            <button
              className="secondary"
              disabled={!aiReady}
              onClick={() => void prepare(shown)}
            >
              继续编制
            </button>
          )}
        </section>
      )}
      <div className="course-list">
        {courses.length > 0 && (
          <label className="course-search">
            查找课程
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索课程名称、教材内容或学习备忘"
            />
          </label>
        )}
        {courses
          .filter((course) =>
            [
              course.title,
              course.source,
              ...course.sections.map((s) => s.studyMemo ?? ''),
            ]
              .join('\n')
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
          )
          .map((course) => {
            const completed = course.sections.filter(
              (s) => s.completedAt,
            ).length;
            return (
              <article key={course.id} className="course-row">
                <span className="course-row-icon">
                  <BookOpen size={23} />
                </span>
                <div>
                  <h3>{course.title}</h3>
                  <p>
                    {course.sections.length} 节 · {completed} 节已完成 ·{' '}
                    {course.sourceNames.length
                      ? course.sourceNames.join('、')
                      : '自建学习资料'}
                  </p>
                  <div className="course-mini-progress">
                    <span
                      style={{
                        width: (100 * completed) / course.sections.length + '%',
                      }}
                    />
                  </div>
                  {course.sections.some((s) => s.error) && (
                    <p role="alert">
                      {courseErrorMessage(
                        course.sections.find((s) => s.error)?.error,
                      )}
                    </p>
                  )}
                </div>
                <button
                  className="secondary"
                  disabled={!!working}
                  onClick={() =>
                    course.sections.some((s) => s.content)
                      ? navigate('course', course.id)
                      : void prepare(course)
                  }
                >
                  {course.status === 'ready'
                    ? completed === course.sections.length
                      ? '回顾课程'
                      : '继续学习'
                    : '查看进度'}
                  <ArrowRight size={15} />
                </button>
              </article>
            );
          })}
        {query.trim() &&
          !courses.some((course) =>
            [
              course.title,
              course.source,
              ...course.sections.map((s) => s.studyMemo ?? ''),
            ]
              .join('\n')
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
          ) && <p className="muted">没有匹配的课程，请尝试其他关键词。</p>}
      </div>
    </div>
  );
}
