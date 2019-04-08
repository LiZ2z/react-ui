/*
 * @Author: LI SHUANG
 * @Email: fitz-i@foxmail.com
 * @Description:
 * @Date: 2019-03-13 18:14:57
 * @LastEditTime: 2019-04-03 13:39:15
 */

/**
 * 不确定变量：
 * 1. 视口高度
 * 2. 每个节点高度
 *
 * 体验：
 * 1. 在什么位置替换节点
 * 2. 替换节点后的处理
 *
 */

import React, {useState, useEffect} from 'react';

function useBigDataRender({data = [], range = 50, height = 300}) {

    const [index, setIndex] = useState(0);
    const [offsetTop, setOffsetTop] = useState(0);
    const [totalHeight, setTotalHeight] = useState(0);
    const [prevScrollTop, setPrevScrollTop] = useState(0);
    // const [prevScrollLeft, setPrevScrollLeft] = useState(0);
    const [prevTime, setPrevTime] = useState(0);
    const [timer, setTimer] = useState(null);
    const contentRef = React.createRef();
    const shouldRenderDirectly = data.length < range;

    const setStepAndOffsetTop = (nextIndex, halfContainerHeight) => {
        // 最底部
        if (nextIndex + (2*range) > data.length-1) {
            setIndex(data.length - (2*range));
            setOffsetTop(totalHeight - halfContainerHeight * 2);
        }
        // 顶部
        else if(nextIndex<=0) {
            setIndex(0);
            setOffsetTop(0);
        }
        // 中间
        else {
            setOffsetTop(halfContainerHeight * Math.ceil(nextIndex/range));
            setIndex(nextIndex);
        }
    };

    const handleScroll = function (e) {
        if (shouldRenderDirectly) {
            return;
        }
        const wrapEl = e.target;
        const scrollTop = wrapEl.scrollTop;

        const minDistance = 0; //this.props.distance
        const containerEl = contentRef.current;
        const containerHeight = containerEl.clientHeight;
        const halfContainerHeight = containerHeight / 2;

        setPrevScrollTop(scrollTop);

        // const scrollLeft = wrapEl.scrollLeft;
        // if(Math.abs(scrollLeft-prevScrollLeft )> Math.abs(scrollTop-prevScrollTop)) {
        //     setPrevScrollLeft(scrollLeft);
        //     return;
        // }

        const time = +new Date();
        setPrevTime(time);
        if (Math.abs(scrollTop - prevScrollTop) / (time - prevTime) > 20) {
            clearTimeout(timer);
            let newTimer = null;
            // TODO: 算法不精确
            if (scrollTop > prevScrollTop) {
                newTimer = setTimeout(() => {
                    const diff = containerHeight -
                        scrollTop -
                        height;
                    let curDistance = offsetTop + diff;
                    let nextIndex = index;
                    while (curDistance <= minDistance) {
                        nextIndex += range;
                        curDistance = diff + halfContainerHeight  * Math.ceil(nextIndex/range);
                    }
                    setStepAndOffsetTop(nextIndex, halfContainerHeight);
                }, 100);

            } else {
                newTimer = setTimeout(() => {
                    let curDistance = scrollTop - offsetTop;
                    let nextIndex = index;
                    while (curDistance <= minDistance) {
                        nextIndex -= range;
                        curDistance = scrollTop - halfContainerHeight * Math.ceil(nextIndex/range);
                    }
                    setStepAndOffsetTop(nextIndex, halfContainerHeight);
                }, 32);
            }

            setTimer(newTimer);
            return;
        }

        // 向下滚动，内容上移
        if (scrollTop > prevScrollTop) {
            // 距最底部内容滚动到视口小于 dist 距离长度时，更换数据
            const curDistance = offsetTop +
                containerHeight -
                scrollTop -
                height;
            if (curDistance < minDistance) {
                setStepAndOffsetTop(index + range, halfContainerHeight);
            }
        }
        // 向上滚动，内容下移
        else {
            const curDistance = scrollTop - offsetTop;
            if (curDistance < minDistance) {
                setStepAndOffsetTop(index - range, halfContainerHeight);
            }
        }
    };

   // 计算总高度
    useEffect(() => {
        if (shouldRenderDirectly) {
            return;
        }
        setTotalHeight(contentRef.current.clientHeight / 2 * (data.length / range));
    });




    return {
        // 轨道
        trackHeight: totalHeight,

        // 内容
        contentRef,
        contentStyle: {transform: `translate3d(0,${offsetTop}px,0)`},
        data: shouldRenderDirectly ? data : data.slice(index, index + (range*2)),

        // 状态及数据
        index: index,
        shouldRenderDirectly,

        // 容器
        containerStyle: {
            height: height,
            position: 'relative',
            overflowY: 'auto',
            // overflowX: 'hidden'
        },
        handleContainerScroll: handleScroll,
    };

}

export default useBigDataRender;