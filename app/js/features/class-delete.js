(() => {
    if (typeof removeClass !== 'function' || typeof db === 'undefined') return;

    async function deleteClassWithStudents(id) {
        const item = typeof classById === 'function' ? classById(id) : null;
        if (!item) return;

        const classStudents = Array.isArray(couples)
            ? couples.filter(student => student.classId === id)
            : [];
        const affectedStudents = classStudents.reduce(
            (total, student) => total + (student.person2 ? 2 : 1),
            0
        );
        const registrations = classStudents.length;
        const studentText = affectedStudents === 1 ? '1 aluno' : `${affectedStudents} alunos`;
        const registrationText = registrations === 1 ? '1 cadastro' : `${registrations} cadastros`;
        const message = affectedStudents
            ? `Excluir a turma “${item.name}” e ${studentText} vinculados (${registrationText})? Esta ação não pode ser desfeita.`
            : `Excluir a turma “${item.name}”? Esta ação não pode ser desfeita.`;

        if (!confirm(message)) return;

        const {error} = await db.rpc('delete_class_with_students', {
            target_class_id: id
        });
        if (error) {
            console.error('atomic class deletion failed', error);
            if (typeof toast === 'function') toast('Erro ao excluir turma e alunos.');
            return;
        }

        classes = classes.filter(classItem => classItem.id !== id);
        couples = couples.filter(student => student.classId !== id);
        render();
        if (typeof renderClassList === 'function') renderClassList();
        if (typeof toast === 'function') {
            toast(affectedStudents
                ? `Turma e ${studentText} excluídos.`
                : 'Turma excluída.');
        }
    }

    removeClass = deleteClassWithStudents;
    window.ClassDeleteActions = {deleteClassWithStudents};
})();
