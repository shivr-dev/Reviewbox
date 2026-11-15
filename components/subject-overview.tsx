'use client';

import { ArrowDownRight, ArrowRight, BookOpen, FolderOpen, LibraryBig, ListChecks, Network } from 'lucide-react';
import { formatNumber, tr } from '@/lib/i18n';
import { subjectLabel } from '@/lib/presentation';
import { SUBJECTS } from '@/lib/model';
import type { Course } from '@/lib/course-model';
import { useReview } from './review-context';
import SubjectIcon from './subject-icon';

export default function SubjectOverview({ selected }: { selected: string }) {
  const {data, navigate} = useReview();
  const discipline = SUBJECTS.find(item => item.id === selected);
  const inScope = (record: {subject: string}) => selected === 'all' || record.subject === selected;
  const courses = (data.jobs ?? []).filter((job): job is Course =>
    job.kind === 'course' && inScope(job)
  ).sort((a,b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  const materials = data.materials.filter(inScope).sort((a,b) => b.date.localeCompare(a.date));
  const questions = data.questions.filter(inScope);
  const topics = data.nodes.filter(inScope);
  const packs = data.packs.filter(pack => !['review-core','review-framework'].includes(pack.id) && inScope(pack));
  const course = courses.find(item => item.status === 'ready') ?? courses[0];
  const lesson = course?.sections?.[course.current];
  const lastMaterial = materials[0];
  const lastAnswer = data.events.findLast(inScope);
  const topic = topics.find(node => node.id === lastAnswer?.nodeId) ?? topics[0];
  const go = (section: string) => navigate('subjects', selected, section);

  return (
    <div className="rb-subject-overview">
      <header className="rb-subject-overview-heading">
        <span className="rb-subject-glyph" style={{color:discipline?.color ?? 'var(--rb-violet)'}}>
          {discipline ? <SubjectIcon subject={discipline.id} size={25}/> : <LibraryBig size={25} aria-hidden="true"/>}
        </span>
        <div>
          <h2>{discipline ? subjectLabel(discipline.id) : tr('common:全部学科')}</h2>
          {topic && <p>{topic.title}</p>}
        </div>
        <button type="button" className="quiet" onClick={() => go('practice')}>
          {tr('subjects:练习')} / {tr('subjects:测试')}<ArrowDownRight size={17} aria-hidden="true"/>
        </button>
      </header>
      <div className="rb-subject-shelf">
        <section className="rb-subject-volume rb-subject-volume-course">
          <div className="rb-subject-volume-label">
            <BookOpen size={19} aria-hidden="true" />
            <h3>{tr('library:课程')}</h3><span>{formatNumber(courses.length)}</span>
          </div>
          {course ? <div className="rb-subject-volume-copy">
            <button className="rb-subject-resource" onClick={() => course.status === 'ready'
              ? navigate('course', course.id) : navigate('subjects', course.subject, 'courses')}>
              {course.title}<ArrowRight size={18} aria-hidden="true" />
            </button>
            {lesson && lesson.title !== course.title && <p>{lesson.title}</p>}
          </div> : <p className="rb-subject-volume-empty">{tr('library:courseEmpty')}</p>}
          <button className="quiet" onClick={() => go('courses')}>
            {tr('library:viewCourses')}<ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
        <section className="rb-subject-volume rb-subject-volume-material">
          <div className="rb-subject-volume-label">
            <FolderOpen size={19} aria-hidden="true" />
            <h3>{tr('library:资料与导入')}</h3><span>{formatNumber(materials.length)}</span>
          </div>
          {lastMaterial ? <div className="rb-subject-volume-copy">
            <button className="rb-subject-resource" onClick={() => navigate('subjects', lastMaterial.subject, 'materials', lastMaterial.id)}>
              {lastMaterial.name}<ArrowRight size={18} aria-hidden="true" />
            </button>
            {selected === 'all' && <p>{subjectLabel(lastMaterial.subject)}</p>}
          </div> : <p className="rb-subject-volume-empty">{tr('library:materialEmpty')}</p>}
          <div className="rb-subject-volume-actions">
            <button className="quiet" onClick={() => go('materials')}>
              {tr('library:openMaterials')}<ArrowRight size={16} aria-hidden="true" />
            </button>
            <button className="quiet" onClick={() => go('import')}>{tr('library:导入')}</button>
            <button className="quiet" onClick={() => go('packs')}>
              {tr('library:学习包')} <span className="rb-subject-pack-count">{formatNumber(packs.length)}</span>
            </button>
          </div>
        </section>
        <div className="rb-subject-collections">
          {[
            {id:'questions',label:'library:题库管理',icon:ListChecks,count:questions.length},
            {id:'map',label:'library:知识地图',icon:Network,count:topics.length},
          ].map(({id,label,icon:Icon,count}) => <button key={id} type="button" onClick={() => go(id)}>
            <Icon size={18} aria-hidden="true"/>
            <span><strong>{tr(label)}</strong><small>{formatNumber(count)}</small></span>
            <ArrowRight size={16} aria-hidden="true"/>
          </button>)}
        </div>
      </div>
    </div>
  );
}

